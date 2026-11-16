import test from 'node:test';
import assert from 'node:assert/strict';
import { assertQaDisposableDatabaseConfig } from '../qa/support/disposable-database-guard-v1288.mjs';

const safe = Object.freeze({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:synthetic@127.0.0.1:5432/contagest_e2e?schema=public',
  DIRECT_DATABASE_URL: 'postgresql://postgres:synthetic@127.0.0.1:5432/contagest_e2e?schema=public'
});

test('#1288 guard accepts only one disposable, loopback database across aliases', () => {
  assert.equal(assertQaDisposableDatabaseConfig(safe), 'contagest_e2e');
  assert.equal(assertQaDisposableDatabaseConfig({
    ...safe, DATABASE_RUNTIME_URL: 'postgres://runtime:synthetic@127.0.0.1:5432/contagest_e2e'
  }), 'contagest_e2e');
  assert.equal(assertQaDisposableDatabaseConfig({
    NODE_ENV: 'test', DATABASE_URL: 'postgresql://postgres:synthetic@[::1]:5432/harness_drill'
  }), 'harness_drill');
});

test('#1288 rejects runtime and migration alias redirection even when DATABASE_URL appears safe', () => {
  const attempts = [
    { DATABASE_RUNTIME_URL: 'postgresql://runtime:secret@db.prod.test:5432/contagest_e2e' },
    { DIRECT_DATABASE_URL: 'postgresql://postgres:secret@db.prod.test:5432/contagest_e2e' },
    { DATABASE_RUNTIME_URL: 'postgresql://runtime:secret@127.0.0.1:5433/contagest_e2e' },
    { DIRECT_DATABASE_URL: 'postgresql://postgres:secret@127.0.0.1:5432/other_e2e' },
    { DATABASE_RUNTIME_URL: 'postgresql://runtime:secret@localhost:5432/contagest_e2e' },
    { DATABASE_RUNTIME_URL: 'https://127.0.0.1:5432/contagest_e2e' }
  ];
  for (const alias of attempts) {
    assert.throws(() => assertQaDisposableDatabaseConfig({ ...safe, ...alias }),
      { message: 'QA_EPHEMERAL_DATABASE_REQUIRED' });
  }
});

test('#1288 refuses production/test config drift and shared database identifiers', () => {
  const attempts = [
    { NODE_ENV: 'production' }, { NODE_ENV: 'development' },
    { VERCEL: '1' }, { VERCEL_ENV: 'preview' },
    { DATABASE_URL: '' }, { DATABASE_URL: 'not-a-url' },
    { DATABASE_URL: 'postgresql://prod:synthetic@db.prod.test/prod' },
    { DATABASE_URL: 'postgresql://postgres:synthetic@127.0.0.1:5432/contagest' },
    { DATABASE_URL: 'postgresql://postgres:synthetic@127.0.0.1:5432/contagest_e2e%2Fother' },
    { DATABASE_URL: 'postgresql://postgres:synthetic@127.0.0.1:5432/contagest_e2e%ZZ' },
    { DATABASE_URL: 'sqlite:///contagest_e2e' }
  ];
  for (const item of attempts) {
    const values = { ...safe, ...item };
    if (Object.hasOwn(item, 'DATABASE_URL')) delete values.DIRECT_DATABASE_URL;
    assert.throws(() => assertQaDisposableDatabaseConfig(values),
      { message: 'QA_EPHEMERAL_DATABASE_REQUIRED' });
  }
  assert.throws(() => assertQaDisposableDatabaseConfig(null),
    { message: 'QA_EPHEMERAL_DATABASE_REQUIRED' });
});

test('#1288 guard error never includes connection URL or password', () => {
  const privateUrl = 'postgresql://privateuser:sensitive-test-password@db.example.test:5432/customer_e2e';
  let captured = '';
  try { assertQaDisposableDatabaseConfig({ ...safe, DATABASE_RUNTIME_URL: privateUrl }); }
  catch (error) { captured = String(error); }
  assert.match(captured, /QA_EPHEMERAL_DATABASE_REQUIRED/);
  assert.doesNotMatch(captured, /privateuser|sensitive-test-password|db\.example\.test|customer_e2e/);
});
