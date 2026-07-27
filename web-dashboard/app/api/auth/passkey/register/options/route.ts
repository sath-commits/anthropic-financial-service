import { generateRegistrationOptions } from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { passkeyConfig } from '@/lib/security/passkey-config';
import { isAllowedPasskeyUser, listPasskeys } from '@/lib/security/passkeys';
import { rateLimit, readJsonBody, requireSameOrigin, secretMatches } from '@/lib/security/request';
import { createSignedValue } from '@/lib/security/session';

const CHALLENGE_COOKIE = 'btn-passkey-challenge';

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const limited = rateLimit(request, 'passkey-register', 5, 15 * 60 * 1000);
  if (limited) return limited;
  const { value, error } = await readJsonBody<{ username?: string; bootstrapSecret?: string }>(request, 8 * 1024);
  if (error) return error;
  const username = value?.username?.trim() ?? '';
  const suppliedSecret = value?.bootstrapSecret ?? '';
  const expectedSecret = process.env.PASSKEY_BOOTSTRAP_SECRET ?? '';
  if (!username || !isAllowedPasskeyUser(username) || !expectedSecret || !secretMatches(suppliedSecret, expectedSecret)) {
    return NextResponse.json({ error: 'Passkey enrollment is not authorized.' }, { status: 403 });
  }

  try {
    const { rpID } = passkeyConfig(request);
    const existing = await listPasskeys(username);
    const options = await generateRegistrationOptions({
      rpName: 'Family Finance Dashboard',
      rpID,
      userName: username,
      userDisplayName: username,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      excludeCredentials: existing.map(passkey => ({
        id: passkey.id,
        transports: passkey.transports,
      })),
    });
    const challenge = createSignedValue({
      purpose: 'passkey-register',
      username,
      challenge: options.challenge,
      expires: Date.now() + 5 * 60 * 1000,
    });
    const jar = await cookies();
    jar.set(CHALLENGE_COOKIE, challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 5 * 60,
      path: '/',
    });
    return NextResponse.json(options);
  } catch {
    return NextResponse.json({ error: 'Passkey enrollment is not configured.' }, { status: 503 });
  }
}
