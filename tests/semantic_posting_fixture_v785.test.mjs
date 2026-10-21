import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareQaSemanticPosting } from '../qa/support/semantic-posting-fixture.ts';

function fixture(database = 'contagest_financial_v90_e2e') {
  const calls = [];
  const mapped = [{ role: 'ar', accountCode: 'QA-CUSTOM-AR' }];
  return {
    calls, mapped,
    h: {
      prisma: { $queryRaw: async () => [{ name: database }] },
      ok: async (url, options) => {
        calls.push([url, options?.method || 'GET']);
        if (url === '/chart-accounts/role-mappings' && !options) return mapped;
        if (url === '/chart-accounts/role-mappings' && options?.method === 'POST') {
          mapped.push(JSON.parse(options.body));
          return {};
        }
        if (url.startsWith('/chart-accounts/role-mappings/readiness?')) return { ready: true };
        return {};
      },
    },
  };
}

test('#785 QA fixture rejects any non-disposable database before it mutates accounts', async () => {
  for (const database of ['contagest_production', 'contagest', 'production_e2e', 'contagest_shared']) {
    const { h, calls } = fixture(database);
    await assert.rejects(prepareQaSemanticPosting(h), /disposable versioned QA PostgreSQL/);
    assert.equal(calls.length, 0);
  }
});

test('#785 QA fixture explicitly maps missing roles, keeps custom bindings, checks all flows', async () => {
  const { h, calls, mapped } = fixture();
  await prepareQaSemanticPosting(h);
  assert.equal(mapped.find(row => row.role === 'ar').accountCode, 'QA-CUSTOM-AR');
  assert.equal(calls.filter(([url, method]) => url === '/chart-accounts/role-mappings' && method === 'POST').length, 6);
  assert.equal(calls.filter(([url]) => url.startsWith('/chart-accounts/role-mappings/readiness?')).length, 3);
});

test('#785 QA fixture fails when required mapping is inactive or incomplete', async () => {
  const { h } = fixture();
  const original = h.ok;
  h.ok = async (url, options) => url.includes('readiness?flow=purchases') ? { ready: false } : original(url, options);
  await assert.rejects(prepareQaSemanticPosting(h), /not ready for purchases/);
});
