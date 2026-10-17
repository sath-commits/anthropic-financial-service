import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWithWakeRetry } from '../lib/data-service.ts';

const FAST = { delayMs: 1 };

// What Node's fetch throws when the sleeping data service refuses the connection.
function connectionRefused() {
  return new TypeError('fetch failed', {
    cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
  });
}

function stubFetch(t, responses) {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    const next = responses[Math.min(calls, responses.length - 1)];
    calls++;
    if (next instanceof Error) throw next;
    return next;
  };
  t.after(() => { globalThis.fetch = original; });
  return () => calls;
}

test('first request after the data service sleeps still succeeds once it has booted', async t => {
  const calls = stubFetch(t, [connectionRefused(), connectionRefused(), new Response('{"ok":true}')]);
  const res = await fetchWithWakeRetry('http://data-service/call', { method: 'POST' }, FAST);
  assert.equal(res.status, 200);
  assert.equal(calls(), 3);
});

test('HTTP error responses come back immediately instead of adding wake-up delay', async t => {
  const calls = stubFetch(t, [new Response('boom', { status: 500 })]);
  const res = await fetchWithWakeRetry('http://data-service/call', { method: 'POST' }, FAST);
  assert.equal(res.status, 500);
  assert.equal(calls(), 1);
});

test('a request that hits the per-attempt timeout is not retried, so a hung service cannot stall a page for minutes', async t => {
  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  const calls = stubFetch(t, [timeout]);
  await assert.rejects(
    fetchWithWakeRetry('http://data-service/call', { method: 'POST' }, FAST),
    error => error.name === 'TimeoutError',
  );
  assert.equal(calls(), 1);
});

test('a service that never comes up fails after the configured attempts rather than retrying forever', async t => {
  const calls = stubFetch(t, [connectionRefused()]);
  await assert.rejects(
    fetchWithWakeRetry('http://data-service/call', { method: 'POST' }, { ...FAST, attempts: 4 }),
    TypeError,
  );
  assert.equal(calls(), 4);
});
