import { NextResponse } from 'next/server';

type ProbeResult = {
  ok: boolean;
  status?: number;
  statusText?: string;
  body?: unknown;
  error?: string;
};

function sanitizeUrl(rawUrl: string | undefined) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    return {
      protocol: url.protocol,
      host: url.host,
      pathname: url.pathname,
      usesPrivateRailwayHost: url.hostname.endsWith('.railway.internal'),
    };
  } catch {
    return { invalid: true };
  }
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
}

async function probe(url: string, init?: RequestInit): Promise<ProbeResult> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      body: await parseResponseBody(res),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET() {
  const rawBaseUrl = process.env.DATA_SERVICE_URL;
  const token = process.env.DATA_SERVICE_TOKEN;
  const baseUrl = rawBaseUrl?.replace(/\/$/, '');

  const diagnostics: Record<string, unknown> = {
    dashboardEnv: {
      dataServiceUrlPresent: Boolean(rawBaseUrl),
      dataServiceUrl: sanitizeUrl(rawBaseUrl),
      dataServiceTokenPresent: Boolean(token),
      dataServiceTokenLength: token?.length ?? 0,
      nodeEnv: process.env.NODE_ENV,
      railwayServiceName: process.env.RAILWAY_SERVICE_NAME ?? null,
      railwayEnvironmentName: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
    },
  };

  if (!baseUrl || !token) {
    return NextResponse.json(diagnostics, { status: 503 });
  }

  diagnostics.health = await probe(`${baseUrl}/health`);
  diagnostics.callWithoutAuth = await probe(`${baseUrl}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'get_quote', params: { symbol: 'NVDA' } }),
  });
  diagnostics.callWithAuth = await probe(`${baseUrl}/call`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ method: 'get_quote', params: { symbol: 'NVDA' } }),
  });

  return NextResponse.json(diagnostics);
}
