import assert from 'node:assert/strict';
import test from 'node:test';
import { automationScopeLockKey, lockAutomationScope } from './automation-scope.js';

test('automation scope lock keeps pg advisory locking while returning a Prisma-supported scalar', async () => {
  let strings: readonly string[] | null = null;
  let values: unknown[] = [];
  const db = {
    $queryRaw(template: TemplateStringsArray, ...params: unknown[]) {
      strings = [...template];
      values = params;
      return Promise.resolve([{ locked: true }]);
    }
  };

  await lockAutomationScope(
    db as any,
    '11111111-1111-4111-8111-111111111111',
    'agent-e2e-a',
    'group-a@g.us'
  );

  const sql = (strings || []).join('?');
  assert.match(sql, /WITH acquired AS MATERIALIZED/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(\?, 0\)\)/);
  assert.match(sql, /SELECT true AS "locked" FROM acquired/);
  assert.deepEqual(values, [
    automationScopeLockKey(
      '11111111-1111-4111-8111-111111111111',
      'agent-e2e-a',
      'group-a@g.us'
    )
  ]);
});
