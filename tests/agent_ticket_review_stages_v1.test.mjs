import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { planTicketReviewStages } from '../scripts/agent-review-stages.mjs';

for (const type of ['feature', 'bugfix', 'refactor', 'migration', 'incident', 'design']) {
  test('ticket ' + type + ': FODA is advisory; independent audit is mandatory', () => {
    const stages = planTicketReviewStages({ type, risk: 'P1' });
    assert.deepEqual(stages.map((stage) => stage.id), ['foda-senior', 'auditoria-independiente']);
    assert.equal(stages[0].required, false);
    assert.equal(stages[0].canApproveMerge, false);
    assert.equal(stages[1].required, true);
    assert.equal(stages[1].independence, 'separate-reviewer-required');
    assert.equal(stages[1].canApproveMerge, false);
  });
}

test('audit-only ticket skips implementation FODA but retains independent review', () => {
  const stages = planTicketReviewStages({ type: 'audit', risk: 'P2' });
  assert.deepEqual(stages.map((stage) => stage.id), ['auditoria-independiente']);
  assert.equal(stages[0].independence, 'separate-reviewer-preferred');
});

test('unsupported task type or risk fails closed', () => {
  assert.throws(() => planTicketReviewStages({ type: 'deploy' }), /AGENT_ROUTE_AMBIGUOUS/);
  assert.throws(() => planTicketReviewStages({ risk: 'HIGH' }), /AGENT_ROUTE_AMBIGUOUS/);
});

test('all declared review profiles exist with stable frontmatter and SHA evidence rules', () => {
  for (const stage of planTicketReviewStages({ type: 'feature', risk: 'P0' })) {
    assert.equal(fs.existsSync(stage.profile), true, stage.profile);
    const content = fs.readFileSync(stage.profile, 'utf8');
    assert.match(content, new RegExp('^id: ' + stage.id + '$', 'm'));
    assert.match(content, /SHA|evidencia/);
  }
});

test('ticket gate router retains specialist agents and 2–4 ACTIVE skills', () => {
  const output = JSON.parse(execFileSync(process.execPath,
    ['scripts/agent-gate-router.mjs', '--base', 'main', '--type', 'feature',
      '--files', '.agents/agents/foda-senior.md'], { encoding: 'utf8' }));
  assert.ok(output.agents.includes('orchestrator'));
  assert.ok(output.agents.includes('appsec-iam'));
  assert.ok(output.agents.includes('qa-release'));
  assert.ok(output.skills.length >= 2 && output.skills.length <= 4);
  assert.deepEqual(output.reviewStages.map((stage) => stage.id),
    ['foda-senior', 'auditoria-independiente']);
  assert.ok(output.reviewStages.every((stage) => !output.agents.includes(stage.id)));
  assert.deepEqual(output.reviewStages.map((stage) => stage.profile), [
    '.agents/agents/foda-senior.md',
    '.agents/agents/auditoria-independiente.md',
  ]);
});
