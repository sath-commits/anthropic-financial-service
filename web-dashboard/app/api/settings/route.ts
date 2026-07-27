import { NextResponse } from 'next/server';
import { readJsonBody, requireSameOrigin } from '@/lib/security/request';
import { readSettings, writeSettings, type StoredSettings } from '@/lib/server/settings-store';

interface SettingsRequest extends StoredSettings {
  allowEmptyPositions?: boolean;
}

export async function GET(req: Request) {
  const settings = await readSettings();
  if (new URL(req.url).searchParams.get('download') === '1') {
    return new NextResponse(JSON.stringify(settings, null, 2), {
      headers: {
        'Content-Disposition': `attachment; filename="beta-than-nothing-portfolio-${new Date().toISOString().slice(0, 10)}.json"`,
        'Content-Type': 'application/json',
      },
    });
  }
  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const { value: body, error } = await readJsonBody<SettingsRequest>(req, 2 * 1024 * 1024);
  if (error) return error;
  if (!body || (body.positions === undefined && body.profile === undefined && body.properties === undefined && body.otherAssets === undefined)) {
    return NextResponse.json({ error: 'Provide at least one setting to update.' }, { status: 400 });
  }
  if (body.positions !== undefined && !Array.isArray(body.positions)) {
    return NextResponse.json({ error: 'Positions must be an array.' }, { status: 400 });
  }
  if (body.profile !== undefined && (!body.profile || typeof body.profile !== 'object')) {
    return NextResponse.json({ error: 'Profile must be an object.' }, { status: 400 });
  }
  if (body.properties !== undefined && !Array.isArray(body.properties)) {
    return NextResponse.json({ error: 'Properties must be an array.' }, { status: 400 });
  }
  if (body.otherAssets !== undefined && !Array.isArray(body.otherAssets)) {
    return NextResponse.json({ error: 'Other assets must be an array.' }, { status: 400 });
  }
  try {
    const current = await readSettings();
    if (body.positions?.length === 0 && current.positions?.length && !body.allowEmptyPositions) {
      return NextResponse.json({ error: 'Refusing to replace a non-empty portfolio with an empty portfolio without explicit confirmation.' }, { status: 409 });
    }
    return NextResponse.json(await writeSettings({ positions: body.positions, profile: body.profile, properties: body.properties, otherAssets: body.otherAssets }));
  } catch {
    return NextResponse.json({ error: 'Could not persist portfolio settings.' }, { status: 500 });
  }
}
