import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import type { UserPosition } from '@/lib/types';

export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 5;
const MAX_TOTAL_IMAGE_BYTES = 24 * 1024 * 1024;
const MAX_TEXT_LENGTH = 20_000;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ACCOUNT_TYPES = new Set<UserPosition['accountType']>(['taxable', 'ira', 'roth_ira', '401k', 'hsa']);
const ASSET_CLASSES = new Set([
  'US Large Cap', 'US Small/Mid Cap', 'International', 'Emerging Markets',
  'Bonds', 'REITs', 'Alternatives', 'Cash',
]);

const portfolioSchema = {
  name: 'portfolio_import',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      positions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            symbol: { type: 'string' },
            name: { type: ['string', 'null'] },
            shares: { type: ['number', 'null'] },
            avgCost: { type: ['number', 'null'] },
            accountType: { type: ['string', 'null'], enum: ['taxable', 'ira', 'roth_ira', '401k', 'hsa', null] },
            assetClass: {
              type: ['string', 'null'],
              enum: ['US Large Cap', 'US Small/Mid Cap', 'International', 'Emerging Markets', 'Bonds', 'REITs', 'Alternatives', 'Cash', null],
            },
            purchaseDate: { type: ['string', 'null'] },
          },
          required: ['symbol', 'name', 'shares', 'avgCost', 'accountType', 'assetClass', 'purchaseDate'],
        },
      },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['positions', 'warnings'],
  },
} as const;

type ImportedPosition = {
  symbol: string;
  name: string | null;
  shares: number | null;
  avgCost: number | null;
  accountType: UserPosition['accountType'] | null;
  assetClass: string | null;
  purchaseDate: string | null;
};

type PortfolioImport = {
  positions: ImportedPosition[];
  warnings: string[];
};

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function validateImageDataUrl(imageDataUrl: string): { error: string | null; size: number } {
  const match = imageDataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/i);
  const imageType = match?.[1].toLowerCase();
  const encodedImage = match?.[2].replace(/\s/g, '') ?? '';
  if (!match || !imageType || !ALLOWED_IMAGE_TYPES.has(imageType) || !/^[A-Za-z0-9+/]*={0,2}$/.test(encodedImage)) {
    return { error: 'Upload PNG, JPEG, or WEBP screenshots.', size: 0 };
  }
  const size = Math.ceil((encodedImage.length * 3) / 4);
  return {
    error: size > MAX_IMAGE_BYTES ? 'Each screenshot must be smaller than 8 MB.' : null,
    size,
  };
}

function sanitizeImport(raw: PortfolioImport): PortfolioImport {
  const warnings = [...raw.warnings];
  const seen = new Set<string>();
  const positions = raw.positions
    .map(position => {
      const symbol = position.symbol.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '');
      if (!symbol) return null;

      if (!position.shares || position.shares <= 0) warnings.push(`${symbol}: enter the share quantity.`);
      if (!position.avgCost || position.avgCost <= 0) warnings.push(`${symbol}: enter the average cost basis.`);
      if (!position.accountType) warnings.push(`${symbol}: confirm the account type.`);
      if (!position.purchaseDate) warnings.push(`${symbol}: add a purchase date for accurate tax analysis.`);

      const sanitized = {
        symbol,
        name: position.name?.trim() || symbol,
        shares: position.shares && position.shares > 0 ? position.shares : null,
        avgCost: position.avgCost && position.avgCost > 0 ? position.avgCost : null,
        accountType: position.accountType && ACCOUNT_TYPES.has(position.accountType) ? position.accountType : null,
        assetClass: position.assetClass && ASSET_CLASSES.has(position.assetClass) ? position.assetClass : null,
        purchaseDate: position.purchaseDate?.match(/^\d{4}-\d{2}-\d{2}$/) ? position.purchaseDate : null,
      };
      const fingerprint = [
        sanitized.symbol, sanitized.shares, sanitized.avgCost, sanitized.accountType,
        sanitized.assetClass, sanitized.purchaseDate,
      ].join('|');
      if (seen.has(fingerprint)) {
        warnings.push(`${symbol}: removed an exact duplicate imported from overlapping screenshots.`);
        return null;
      }
      seen.add(fingerprint);
      return sanitized;
    })
    .filter(position => position !== null);

  return { positions, warnings: [...new Set(warnings)] };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { imageDataUrl?: string; imageDataUrls?: string[]; text?: string };
  const text = body.text?.trim() ?? '';
  const imageDataUrls = (body.imageDataUrls ?? (body.imageDataUrl ? [body.imageDataUrl] : []))
    .map(url => url.trim())
    .filter(Boolean);

  if (!text && !imageDataUrls.length) {
    return NextResponse.json({ error: 'Provide a screenshot or pasted holdings.' }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: 'Pasted holdings must be shorter than 20,000 characters.' }, { status: 400 });
  }
  if (imageDataUrls.length > MAX_IMAGES) {
    return NextResponse.json({ error: `Upload no more than ${MAX_IMAGES} screenshots at a time.` }, { status: 400 });
  }
  let totalImageBytes = 0;
  for (const imageDataUrl of imageDataUrls) {
    const result = validateImageDataUrl(imageDataUrl);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    totalImageBytes += result.size;
  }
  if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Combined screenshots must be smaller than 24 MB.' }, { status: 400 });
  }

  const instructions = `Extract investment positions from the supplied portfolio screenshots or pasted text.
Return JSON only using the requested schema.
- Include only actual holdings. Exclude watchlists, totals, cash balances, and pending orders unless cash appears as a holding.
- Do not infer, guess, or generate example holdings. If no legible holdings are visible or supplied, return an empty positions array with a warning.
- Never invent values. Use null when shares, average cost, account type, asset class, or purchase date are missing or unclear.
- Normalize account types to taxable, ira, roth_ira, 401k, or hsa only when explicitly supported by the input.
- Screenshots may overlap. Consolidate rows only when they are clearly the same holding with the same values. Preserve separate tax lots and holdings in different accounts.
- Use YYYY-MM-DD for purchaseDate only when clearly supplied.
- Choose the closest allowed asset class only when reasonably clear.
- Add a warning for ambiguity, missing values, or any row the user should review.`;

  const content: OpenAI.ChatCompletionContentPart[] = [
    { type: 'text', text: text ? `Pasted holdings:\n${text}` : `Extract the holdings from these ${imageDataUrls.length} portfolio screenshot(s).` },
  ];
  for (const imageDataUrl of imageDataUrls) {
    content.push({ type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } });
  }

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: portfolioSchema },
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content },
      ],
    });
    const message = response.choices[0]?.message;
    if (message?.refusal) {
      return NextResponse.json({ error: message.refusal }, { status: 422 });
    }
    const imported = sanitizeImport(JSON.parse(message?.content ?? '{}') as PortfolioImport);
    if (!imported.positions.length) {
      return NextResponse.json({ error: 'No holdings were detected. Try a clearer screenshot or paste the table text.' }, { status: 422 });
    }
    return NextResponse.json(imported);
  } catch {
    return NextResponse.json({ error: 'Portfolio extraction failed. Try again or paste the holdings as text.' }, { status: 502 });
  }
}
