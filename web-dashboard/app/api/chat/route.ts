import OpenAI from 'openai';
import { execSync } from 'child_process';
import path from 'path';

export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

const TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_quote',
      description: 'Get the current price, market cap, and 52-week range for a stock ticker.',
      parameters: {
        type: 'object',
        properties: { symbol: { type: 'string', description: 'Stock ticker symbol' } },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_fundamentals',
      description: 'Get key fundamentals: P/E, EPS, revenue, margins, debt/equity, FCF yield.',
      parameters: {
        type: 'object',
        properties: { symbol: { type: 'string' } },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_analyst_ratings',
      description: 'Get analyst consensus ratings and price targets for a stock.',
      parameters: {
        type: 'object',
        properties: { symbol: { type: 'string' } },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_news',
      description: 'Get recent news headlines for a stock ticker.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          days: { type: 'number', description: 'Days of news (default 7)' },
        },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_earnings_history',
      description: 'Get last 4 quarters of earnings: actual vs. estimate and surprise %.',
      parameters: {
        type: 'object',
        properties: { symbol: { type: 'string' } },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'screen_stocks',
      description: 'Screen stocks by sector, PE ratio, dividend yield, and other criteria.',
      parameters: {
        type: 'object',
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
  },
];

function buildSystemPrompt(portfolioContext?: string, profileContext?: string): string {
  return `You are a personal AI portfolio manager and investment analyst. You have tools to fetch live market data, fundamentals, analyst ratings, and news.
${portfolioContext ? `\n## Current Portfolio\n${portfolioContext}` : ''}
${profileContext ? `\n## Investor Profile\n${profileContext}` : ''}

## Capabilities
- Analyze portfolio drift vs. target allocation and recommend rebalancing trades
- Find tax-loss harvesting opportunities (taxable account positions with unrealized losses)
- Research individual stocks: fundamentals, analyst ratings, recent news, earnings history
- Screen for new investment ideas
- Identify upcoming earnings and catalysts

## Guardrails
- Always show tax implications for any trade (short-term vs. long-term, taxable vs. IRA)
- Show reasoning before proposing trades
- Never claim to execute a trade — recommendations only

Be concise, direct, and data-driven. Use markdown tables when presenting data.`;
}

export async function POST(req: Request) {
  const { messages, portfolioContext, profileContext } = await req.json();

  const systemPrompt = buildSystemPrompt(portfolioContext, profileContext);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (text: string) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));

      try {
        type OAIMessage = OpenAI.ChatCompletionMessageParam;
        const msgHistory: OAIMessage[] = [
          { role: 'system', content: systemPrompt },
          ...messages,
        ];

        // Agentic loop: handle tool calls, then stream final answer
        while (true) {
          // Non-streaming call to detect tool use
          const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: msgHistory,
            tools: TOOLS,
            stream: false,
          });

          const choice = response.choices[0];
          const msg = choice.message;
          msgHistory.push(msg);

          if (choice.finish_reason === 'tool_calls' && msg.tool_calls?.length) {
            // Execute each tool call and append results
            for (const tc of msg.tool_calls) {
              if (tc.type !== 'function') continue;
              let args: Record<string, unknown> = {};
              try { args = JSON.parse(tc.function.arguments); } catch { /* skip */ }
              const result = callPython(tc.function.name, args);
              msgHistory.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(result),
              });
            }
            // Loop again with tool results in context
            continue;
          }

          // No more tool calls — stream the final text answer
          msgHistory.push({ role: 'user', content: '' }); // trigger streaming response
          msgHistory.pop(); // remove the dummy — just stream last assistant msg

          // Re-request with streaming, same messages (last assistant msg already has text)
          if (msg.content) {
            // Already have the final text — send it word-by-word for a streaming feel
            const words = msg.content.split(' ');
            for (const word of words) {
              send(word + ' ');
              await new Promise(r => setTimeout(r, 8));
            }
          } else {
            // Edge case: no content on the final turn — do a fresh streaming call
            const streamResp = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: msgHistory,
              stream: true,
            });
            for await (const chunk of streamResp) {
              const text = chunk.choices[0]?.delta?.content ?? '';
              if (text) send(text);
            }
          }
          break;
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
