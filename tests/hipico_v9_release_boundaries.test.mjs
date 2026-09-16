import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('v9 release boundaries preserve deterministic policy, dual-window promotion and canonical outbox authority', async () => {
  const [riskPolicy, promotion, routes, outbox, agentFacade] = await Promise.all([
    read('backend/src/modules/hipico/risk-policy.ts'),
    read('backend/src/modules/hipico/promotion-policy.ts'),
    read('backend/src/modules/hipico/agent.routes.ts'),
    read('backend/src/modules/hipico-bot/hipico-outbox.store.ts'),
    read('backend/src/modules/hipico/agent-policy.ts')
  ]);

  for (const disposition of ['AUTO', 'SUGGEST', 'HUMAN_REQUIRED', 'DENY']) {
    assert.ok(riskPolicy.includes(`'${disposition}'`), `risk policy missing ${disposition}`);
  }
  assert.match(riskPolicy, /candidate\.source === 'model'/);
  assert.match(riskPolicy, /MODEL_CANDIDATE_REQUIRES_REVIEW/);
  assert.match(riskPolicy, /financialAuthority:\s*false/);
  assert.match(riskPolicy, /SOURCE_READ_ONLY/);

  assert.match(promotion, /RECENT_WINDOW_DAYS\s*=\s*30/);
  assert.match(promotion, /METRIC_SCHEMA_VERSION\s*=\s*'v7'/);
  assert.match(promotion, /RECENT_METRICS_INSUFFICIENT/);
  assert.match(promotion, /historicalReviewed/);
  assert.match(promotion, /recentReviewed/);

  assert.match(routes, /financialAuthority:\s*false/);
  assert.match(routes, /directEffectsApplied:\s*false/);
  assert.match(routes, /actions:\s*\[\]/);
  assert.doesNotMatch(routes, /ownerApproved:\s*body\.ownerApproved/);

  assert.match(outbox, /FOR UPDATE SKIP LOCKED/);
  assert.match(outbox, /status IN \('queued', 'retry'\)/);
  assert.match(outbox, /reconciliation_required/);
  assert.match(outbox, /hipico_outbox_receipts/);
  assert.match(outbox, /monotonicReceiptStatus/);

  assert.match(agentFacade, /export \{ canPromoteAutomation \} from '\.\/promotion-policy\.js'/);
  assert.match(agentFacade, /export \{ HipicoAgentEngine \} from '\.\/agent-evaluator\.js'/);
});
