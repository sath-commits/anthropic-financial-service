import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import type { InvestorProfile, UserPosition } from '@/lib/types';

interface StoredSettings {
  positions?: UserPosition[];
  profile?: InvestorProfile;
}

const settingsPath = process.env.NODE_ENV === 'production'
  ? '/data/portfolio-settings.json'
  : '/tmp/beta-than-nothing-settings.json';
let writeQueue = Promise.resolve();

async function readSettings(): Promise<StoredSettings> {
  try {
    return JSON.parse(await readFile(settingsPath, 'utf8')) as StoredSettings;
  } catch {
    return {};
  }
}

async function writeSettings(patch: StoredSettings): Promise<StoredSettings> {
  let result: StoredSettings = {};
  writeQueue = writeQueue.then(async () => {
    result = { ...await readSettings(), ...patch };
    await mkdir(path.dirname(settingsPath), { recursive: true });
    const temporaryPath = `${settingsPath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(result, null, 2), { mode: 0o600 });
    await rename(temporaryPath, settingsPath);
  });
  await writeQueue;
  return result;
}

export async function GET() {
  return NextResponse.json(await readSettings());
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null) as StoredSettings | null;
  if (!body || (body.positions === undefined && body.profile === undefined)) {
    return NextResponse.json({ error: 'Provide positions or profile settings.' }, { status: 400 });
  }
  if (body.positions !== undefined && !Array.isArray(body.positions)) {
    return NextResponse.json({ error: 'Positions must be an array.' }, { status: 400 });
  }
  if (body.profile !== undefined && (!body.profile || typeof body.profile !== 'object')) {
    return NextResponse.json({ error: 'Profile must be an object.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await writeSettings(body));
  } catch {
    return NextResponse.json({ error: 'Could not persist portfolio settings.' }, { status: 500 });
  }
}
