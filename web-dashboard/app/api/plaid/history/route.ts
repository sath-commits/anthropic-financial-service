import { NextResponse } from 'next/server';
import { readPlaidHistory } from '@/lib/plaid/snapshots';

export async function GET() {
  return NextResponse.json({ history: await readPlaidHistory() });
}
