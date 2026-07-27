import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { passkeyConfig } from '@/lib/security/passkey-config';
import { isAllowedPasskeyUser, listPasskeys } from '@/lib/security/passkeys';
import { rateLimit, readJsonBody, requireSameOrigin } from '@/lib/security/request';
import { createSignedValue } from '@/lib/security/session';

const CHALLENGE_COOKIE = 'btn-passkey-challenge';

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const limited = rateLimit(request, 'passkey-login', 10, 15 * 60 * 1000);
  if (limited) return limited;
  const { value, error } = await readJsonBody<{ username?: string }>(request, 8 * 1024);
  if (error) return error;
  const username = value?.username?.trim() ?? '';
  if (!username || !isAllowedPasskeyUser(username)) {
    return NextResponse.json({ error: 'Passkey sign-in is unavailable.' }, { status: 401 });
  }

  try {
    const passkeys = await listPasskeys(username);
    if (!passkeys.length) {
      return NextResponse.json({ error: 'No passkey is enrolled for this user.' }, { status: 404 });
    }
    const { rpID } = passkeyConfig(request);
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
      allowCredentials: passkeys.map(passkey => ({
        id: passkey.id,
        transports: passkey.transports,
      })),
    });
    const challenge = createSignedValue({
      purpose: 'passkey-login',
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
    return NextResponse.json({ error: 'Passkey sign-in is not configured.' }, { status: 503 });
  }
}
