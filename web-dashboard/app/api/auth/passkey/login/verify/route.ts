import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { passkeyConfig } from '@/lib/security/passkey-config';
import {
  asWebAuthnCredential,
  isAllowedPasskeyUser,
  listPasskeys,
  updatePasskeyCounter,
} from '@/lib/security/passkeys';
import { rateLimit, readJsonBody, requireSameOrigin } from '@/lib/security/request';
import { issueSession, verifySignedValue } from '@/lib/security/session';

const CHALLENGE_COOKIE = 'btn-passkey-challenge';

interface ChallengePayload {
  purpose?: string;
  username?: string;
  challenge?: string;
  expires?: number;
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const limited = rateLimit(request, 'passkey-login-verify', 10, 15 * 60 * 1000);
  if (limited) return limited;
  const { value: response, error } = await readJsonBody<AuthenticationResponseJSON>(request, 64 * 1024);
  if (error) return error;
  const jar = await cookies();
  const signedChallenge = jar.get(CHALLENGE_COOKIE)?.value ?? '';
  jar.set(CHALLENGE_COOKIE, '', { maxAge: 0, path: '/' });
  const challenge = verifySignedValue<ChallengePayload>(signedChallenge);
  if (
    !response
    || challenge?.purpose !== 'passkey-login'
    || !challenge.username
    || !isAllowedPasskeyUser(challenge.username)
    || !challenge.challenge
    || typeof challenge.expires !== 'number'
    || challenge.expires < Date.now()
  ) {
    return NextResponse.json({ error: 'Passkey sign-in expired or is invalid.' }, { status: 400 });
  }

  try {
    const passkey = (await listPasskeys(challenge.username)).find(item => item.id === response.id);
    if (!passkey) return NextResponse.json({ error: 'Passkey sign-in failed.' }, { status: 401 });
    const { origin, rpID } = passkeyConfig(request);
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: asWebAuthnCredential(passkey),
      requireUserVerification: true,
    });
    if (!verification.verified) {
      return NextResponse.json({ error: 'Passkey sign-in failed.' }, { status: 401 });
    }
    await updatePasskeyCounter(challenge.username, passkey.id, verification.authenticationInfo.newCounter);
    await issueSession(challenge.username);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Passkey sign-in failed.' }, { status: 401 });
  }
}
