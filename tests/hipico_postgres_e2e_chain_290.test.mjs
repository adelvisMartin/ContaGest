import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('v290 PostgreSQL chain uses isolated local databases, current v22 agent schema and guaranteed cleanup', async () => {
  const [db, schema, workflow] = await Promise.all([
    read('scripts/hipico-ephemeral-db-v290.mjs'),
    read('scripts/hipico-apply-e2e-schema-v290.mjs'),
    read('.github/workflows/hipico-production-gates-v290.yml')
  ]);

  assert.match(db, /127\.0\.0\.1|localhost/);
  assert.match(db, /hipico_e2e_/);
  assert.match(db, /crypto\.randomBytes/);
  assert.match(db, /DROP DATABASE IF EXISTS/);
  assert.match(schema, /hipico_v22_agent_shadow\.sql/);
  assert.doesNotMatch(schema, /hipico_v16_agent_shadow\.sql/);
  assert.match(schema, /SET LOCAL ROLE/);
  assert.match(schema, /workspaceOwnerIsolation/);
  assert.match(schema, /authenticatedAgentAutomationWriteDenied/);
  assert.match(schema, /authenticatedProviderEvidenceWriteDenied/);
  assert.match(workflow, /hipico-ephemeral-db-v290\.mjs create/);
  assert.match(workflow, /hipico-ephemeral-db-v290\.mjs drop/);
  assert.match(workflow, /if: always\(\)/);
});
