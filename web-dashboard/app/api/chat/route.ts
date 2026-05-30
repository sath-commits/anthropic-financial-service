import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'child_process';
import path from 'path';
import { MOCK_POSITIONS } from '@/lib/mock-portfolio';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');

function callPython(method: string, params: Record<string, unknown>) {
  try {
    const output = execSync('python3 data_service.py', {
      input: JSON.stringify({ method, params }),
      cwd: SCRIPTS_DIR,
      encoding: 'utf-8',
      timeout: 15000,
    });
    return JSON.parse(output);
  } catch {
    return { error: 'Data fetch failed' };
  }
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_quote',
    description: 'Get the current price, market cap, and 52-week range for a stock ticker.',
    input_schema: {
      type: 'object' as const,
      properties: { symbol: { type: 'string', description: 'Stock ticker symbol' } },
      required: ['symbol'],
    },
  },
  {
    name: 'get_fundamentals',
    description: 'Get key fundamentals for a stock: P/E, EPS, revenue, margins, debt/equity, FCF yield.',
    input_schema: {
      type: 'object' as const,
      properties: { symbol: { type: 'string' } },
      required: ['symbol'],
    },
  },
  {
    name: 'get_analyst_ratings',
    description: 'Get analyst consensus ratings and price targets for a stock.',
    input_schema: {
      type: 'object' as const,
      properties: { symbol: { type: 'string' } },
      required: ['symbol'],
    },
  },
  {
    name: 'get_news',
    description: 'Get recent news headlines for a stock ticker.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string' },
        days: { type: 'number', description: 'Number of days of news to fetch (default 7)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_earnings_history',
    description: 'Get last 4 quarters of earnings: actual vs. estimate and surprise percentage.',
    input_schema: {
      type: 'object' as const,
      properties: { symbol: { type: 'string' } },
      required: ['symbol'],
    },
  },
  {
    name: 'screen_stocks',
    description: 'Screen stocks by sector, PE ratio, dividend yield, and other criteria.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sector: { type: 'string' },
        max_pe: { type: 'number' },
        min_dividend_yield: { type: 'number' },
        max_debt_to_equity: { type: 'number' },
        min_market_cap_b: { type: 'number' },
        symbols: { type: 'array', items: { type: 'string' } },
      },
    },
  },
];

function buildSystemPrompt(): string {
  const portfolioSummary = MOCK_POSITIONS.map(p =>
    `${p.symbol} (${p.shares} shares @ $${p.avgCost} avg cost, ${p.accountType}, ${p.holdingDays}d holding)`
  ).join('\n');

  return `You are a personal AI portfolio manager and investment analyst. You have access to tools to fetch live market data, fundamentals, analyst ratings, and news.

## Current Portfolio
${portfolioSummary}

## Target Allocation
- US Large Cap: 60%
- International Developed: 15%
- Emerging Markets: 5%
- Bonds: 20%

## Capabilities
- Analyze portfolio drift vs. target allocation and recommend rebalancing trades
- Find tax-loss harvesting opportunities (focus on taxable account positions with unrealized losses)
- Research individual stocks: fundamentals, analyst ratings, recent news, earnings history
- Screen for new investment ideas based on criteria
- Track investment theses for held positions
- Identify upcoming earnings and catalysts

## Guardrails
- Always show tax implications for any trade you suggest (short-term vs. long-term, taxable vs. IRA)
- Before proposing any trade, show your reasoning clearly
- Never claim to execute a trade — this is a recommendations-only interface

Be concise, direct, and data-driven. Use markdown formatting. When you have data, present it in tables.`;
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: data })}\n\n`));
      };

      try {
        // Agentic loop — handle tool calls
        const msgHistory: Anthropic.MessageParam[] = messages;
        let continueLoop = true;

        while (continueLoop) {
          const response = await client.messages.create({
            model: 'claude-opus-4-8',
            max_tokens: 4096,
            system: buildSystemPrompt(),
            messages: msgHistory,
            tools: TOOLS,
          });

          // Stream text blocks
          for (const block of response.content) {
            if (block.type === 'text') {
              send(block.text);
            }
          }

          if (response.stop_reason === 'end_turn') {
            continueLoop = false;
            break;
          }

          if (response.stop_reason === 'tool_use') {
            const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
            if (toolUseBlocks.length === 0) { continueLoop = false; break; }

            // Add assistant turn
            msgHistory.push({ role: 'assistant', content: response.content });

            // Execute tools
            const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map(block => {
              if (block.type !== 'tool_use') return null!;
              const result = callPython(block.name, block.input as Record<string, unknown>);
              return {
                type: 'tool_result' as const,
                tool_use_id: block.id,
                content: JSON.stringify(result),
              };
            });

            msgHistory.push({ role: 'user', content: toolResults });
          } else {
            continueLoop = false;
          }
        }
      } catch (err) {
        send(`\n\nError: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
