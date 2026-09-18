import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('v290 PostgreSQL chain uses isolated local databases, current v26 schema chain and guaranteed cleanup', async () => {
  const [db, schema, workflow] = await Promise.all([
    read('scripts/hipico-ephemeral-db-v290.mjs'),
    read('scripts/hipico-apply-e2e-schema-v290.mjs'),
    read('.github/workflows/hipico-production-gates-v290.yml')
  ]);

  assert.match(db, /127\.0\.0\.1|localhost/);
  assert.match(db, /hipico_e2e_/);
  assert.match(db, /crypto\.randomBytes/);
  assert.match(db, /DROP DATABASE IF EXISTS/);

  for (const migration of [
    'hipico_v22_agent_shadow.sql',
    'hipico_v23_risk_policy.sql',
    'hipico_v24_shadow_metrics.sql'
  ]) assert.match(schema, new RegExp(migration.replace('.', '\\.')));
  assert.doesNotMatch(schema, /hipico_v16_agent_shadow\.sql/);

  for (const column of [
    'policy_disposition',
    'policy_reason',
    'policy_version',
    'policy_evidence_state',
    'abstained',
    'race_context_error',
    'metric_schema_version'
  ]) assert.match(schema, new RegExp(column));

  for (const constraint of [
    'hipico_agent_evaluations_policy_disposition_check',
    'hipico_agent_evaluations_policy_evidence_state_check',
    'hipico_agent_evaluations_metric_schema_version_check'
  ]) assert.match(schema, new RegExp(constraint));

  assert.match(schema, /SET LOCAL ROLE/);
  assert.match(schema, /workspaceOwnerIsolation/);
  assert.match(schema, /authenticatedAgentAutomationWriteDenied/);
  assert.match(schema, /authenticatedProviderEvidenceWriteDenied/);
  assert.match(schema, /agentPolicyColumnsNotNull/);
  assert.match(schema, /agentMetricColumnsNotNull/);
  assert.match(schema, /agentPolicyConstraintsPresent/);

  assert.match(workflow, /hipico-ephemeral-db-v290\.mjs create/);
  assert.match(workflow, /hipico-ephemeral-db-v290\.mjs drop/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /v12-v27/);
});
