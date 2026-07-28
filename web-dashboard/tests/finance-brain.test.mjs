import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { estimatedMortgageBalance, stableRef } from '../lib/finance-brain/calculations.ts';
import { isInsuranceCategory, isSingaporeHdb, managementMode } from '../lib/finance-brain/policy.ts';
import { assertFinanceBrainSafe } from '../lib/finance-brain/safety.ts';

test('mortgage balance falls over time and never goes negative', () => {
  const terms = {
    ownership: 'mortgage',
    originalLoan: 500_000,
    annualInterestRate: 4,
    loanTermYears: 30,
    loanStartDate: '2020-01',
  };
  const earlier = estimatedMortgageBalance(terms, new Date('2025-01-01T00:00:00Z'));
  const later = estimatedMortgageBalance(terms, new Date('2030-01-01T00:00:00Z'));
  assert.ok(earlier < terms.originalLoan);
  assert.ok(later < earlier);
  assert.equal(estimatedMortgageBalance(terms, new Date('2060-01-01T00:00:00Z')), 0);
});

test('stable references correlate records without exposing their source value', () => {
  const value = 'plaid-account-secret-value';
  const first = stableRef('acct', value);
  assert.equal(first, stableRef('acct', value));
  assert.doesNotMatch(first, /plaid-account-secret-value/);
});

test('only the explicitly configured Robinhood account is agentic', () => {
  assert.equal(managementMode({ brokerage: 'Robinhood', accountMask: '1234' }, '1234'), 'agentic_satellite');
  assert.equal(managementMode({ brokerage: 'Robinhood', accountMask: '5678' }, '1234'), 'user_managed');
  assert.equal(managementMode({ brokerage: 'Robinhood', accountMask: '1234' }, undefined), 'user_managed');
  assert.equal(managementMode({ brokerage: 'Fidelity', accountMask: '1234' }, '1234'), 'user_managed');
});

test('insurance assets are excluded from Finance Brain analysis', () => {
  assert.equal(isInsuranceCategory('Insurance (Cash Value)'), true);
  assert.equal(isInsuranceCategory('Life Insurance'), true);
  assert.equal(isInsuranceCategory('Business Equity'), false);
});

test('Singapore HDB is classified as net-worth-only', () => {
  assert.equal(isSingaporeHdb({ name: 'Bishan HDB', currency: 'SGD' }), true);
  assert.equal(isSingaporeHdb({ currency: 'SGD', annualInterestRate: 2.5, loanTermYears: 30 }), true);
  assert.equal(isSingaporeHdb({ name: 'US home', currency: 'USD', annualInterestRate: 5.625, loanTermYears: 30 }), false);
});

test('snapshot safety rejects direct financial identifiers recursively', () => {
  assert.doesNotThrow(() => assertFinanceBrainSafe({ accounts: [{ accountRef: 'acct_123' }] }));
  assert.throws(
    () => assertFinanceBrainSafe({ positions: [{ plaidAccountId: 'do-not-export' }] }),
    /Forbidden Finance Brain field/,
  );
  assert.throws(
    () => assertFinanceBrainSafe({ positions: [{ accountType: 'cpf' }] }),
    /CPF account data is not permitted/,
  );
  assert.throws(
    () => assertFinanceBrainSafe({ otherAssets: [{ category: 'Insurance (Cash Value)' }] }),
    /Insurance data is not permitted/,
  );
});

test('fetch helper sends the read token and prints only a supported snapshot', async () => {
  const token = 'a'.repeat(64);
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, ['scripts/fetch-finance-brain.mjs'], {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        NODE_OPTIONS: `--import=${new URL('mock-finance-fetch.mjs', import.meta.url).href}`,
        EXPECTED_FINANCE_TOKEN: token,
        FINANCE_BRAIN_SNAPSHOT_URL: 'https://finance.example.test/snapshot',
        FINANCE_BRAIN_READ_TOKEN: token,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('close', code => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).schemaVersion, 1);
  assert.doesNotMatch(result.stdout, new RegExp(token));
});
