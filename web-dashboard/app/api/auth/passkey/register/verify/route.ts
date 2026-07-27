import {
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { passkeyConfig } from '@/lib/security/passkey-config';
import { isAllowedPasskeyUser, savePasskey } from '@/lib/security/passkeys';
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
  const limited = rateLimit(request, 'passkey-register-verify', 5, 15 * 60 * 1000);
  if (limited) return limited;
  const { value: response, error } = await readJsonBody<RegistrationResponseJSON>(request, 128 * 1024);
  if (error) return error;
  const jar = await cookies();
  const signedChallenge = jar.get(CHALLENGE_COOKIE)?.value ?? '';
  jar.set(CHALLENGE_COOKIE, '', { maxAge: 0, path: '/' });
  const challenge = verifySignedValue<ChallengePayload>(signedChallenge);
  if (
    !response
    || challenge?.purpose !== 'passkey-register'
    || !challenge.username
    || !isAllowedPasskeyUser(challenge.username)
    || !challenge.challenge
    || typeof challenge.expires !== 'number'
    || challenge.expires < Date.now()
  ) {
    return NextResponse.json({ error: 'Passkey enrollment expired or is invalid.' }, { status: 400 });
  }

  try {
    const { origin, rpID } = passkeyConfig(request);
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verification.verified) {
      return NextResponse.json({ error: 'Passkey could not be verified.' }, { status: 400 });
    }
    const credential = verification.registrationInfo.credential;
    await savePasskey(challenge.username, {
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports,
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp,
      createdAt: new Date().toISOString(),
    });
    await issueSession(challenge.username);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Passkey could not be verified.' }, { status: 400 });
  }
}
