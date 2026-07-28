import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedRequestOrigin } from '../lib/security/origin.ts';

test('accepts the configured public origin behind a reverse proxy', () => {
  assert.equal(
    isAllowedRequestOrigin(
      'https://invest.builtthisweekend.com',
      'http://renewed-connection.railway.internal/api/auth/login',
      'https://invest.builtthisweekend.com',
    ),
    true,
  );
});

test('normalizes a trailing slash on the configured public origin', () => {
  assert.equal(
    isAllowedRequestOrigin(
      'https://invest.builtthisweekend.com',
      'http://renewed-connection.railway.internal/api/settings',
      'https://invest.builtthisweekend.com/',
    ),
    true,
  );
});

test('rejects an unrelated browser origin', () => {
  assert.equal(
    isAllowedRequestOrigin(
      'https://attacker.example',
      'http://renewed-connection.railway.internal/api/auth/login',
      'https://invest.builtthisweekend.com',
    ),
    false,
  );
});

test('falls back to the request URL origin in local development', () => {
  assert.equal(
    isAllowedRequestOrigin(
      'http://localhost:3000',
      'http://localhost:3000/api/auth/login',
    ),
    true,
  );
});

test('preserves support for non-browser requests without an Origin header', () => {
  assert.equal(
    isAllowedRequestOrigin(
      null,
      'https://invest.builtthisweekend.com/api/auth/login',
      'https://invest.builtthisweekend.com',
    ),
    true,
  );
});
