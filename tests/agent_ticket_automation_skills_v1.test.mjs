import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const automation = await import('../scripts/agent-ticket-automation-lib.mjs').catch(() => null);

function requirePlanner() {
  assert.ok(automation, 'missing agent ticket automation planner');
  assert.equal(typeof automation.planTicketAutomation, 'function');
  assert.equal(typeof automation.inferTicketAutomationSignals, 'function');
  return automation;
}

function capability(plan, id) {
  return plan.capabilities.find((item) => item.id === id);
}

test('batch requires independent work and never exceeds 30 workers', () => {
  const { planTicketAutomation } = requirePlanner();
  const tooSmall = planTicketAutomation({ signals: { independentWorkUnits: 4 } });
  assert.equal(capability(tooSmall, 'contagest-batch'), undefined);

  const eligible = planTicketAutomation({ signals: { independentWorkUnits: 12 } });
  assert.equal(capability(eligible, 'contagest-batch')?.workers, 12);
  assert.equal(capability(eligible, 'contagest-batch')?.requiresIsolation, true);

  const capped = planTicketAutomation({ signals: { independentWorkUnits: 99 } });
  assert.equal(capability(capped, 'contagest-batch')?.workers, 30);
});

test('ordered or destructive migration work is never auto-parallelized', () => {
  const { planTicketAutomation } = requirePlanner();
  const plan = planTicketAutomation({
    type: 'migration',
    boundaries: ['database', 'persistence'],
    signals: { independentWorkUnits: 20, orderedMutation: true },
  });
  assert.equal(capability(plan, 'contagest-batch'), undefined);
});

test('loop is selected only for bounded recurring continuation with a stop condition', () => {
  const { planTicketAutomation } = requirePlanner();
  const absent = planTicketAutomation({ signals: { waitingOnExternalState: true } });
  assert.equal(capability(absent, 'contagest-loop'), undefined);

  const selected = planTicketAutomation({
    signals: { waitingOnExternalState: true, continuationAuthorized: true, stopCondition: 'required checks terminal' },
  });
  const loop = capability(selected, 'contagest-loop');
  assert.equal(loop?.sessionBound, true);
  assert.equal(loop?.stopCondition, 'required checks terminal');
});

test('runtime/bootstrap changes select run-skill-generator without secret capture', () => {
  const { inferTicketAutomationSignals, planTicketAutomation } = requirePlanner();
  const signals = inferTicketAutomationSignals({ files: ['package.json', 'backend/package.json'] });
  assert.equal(signals.runtimeRecipeDrift, true);
  const generator = capability(planTicketAutomation({ files: ['package.json'] }), 'contagest-run-skill-generator');
  assert.equal(generator?.recordSecretValues, false);
});

test('repeated prompts select recommendation-first permission optimization', () => {
  const { planTicketAutomation } = requirePlanner();
  const plan = planTicketAutomation({ signals: { repeatedPermissionPrompts: 3 } });
  const permission = capability(plan, 'contagest-fewer-permission-prompts');
  assert.equal(permission?.autoApply, false);
  assert.equal(permission?.scope, 'project');
  assert.equal(permission?.lowRiskOnly, true);
});

test('agent and skill surface changes automatically select read-only skill-doctor', () => {
  const { inferTicketAutomationSignals, planTicketAutomation } = requirePlanner();
  const signals = inferTicketAutomationSignals({ files: ['.agents/skills/example/SKILL.md'] });
  assert.equal(signals.skillSurfaceChanged, true);
  const doctor = capability(planTicketAutomation({ files: ['config/agent-skill-contracts-v3.json'] }), 'contagest-skill-doctor');
  assert.equal(doctor?.readOnly, true);
});

test('small ordinary tickets do not receive unnecessary execution capabilities', () => {
  const { planTicketAutomation } = requirePlanner();
  const plan = planTicketAutomation({ type: 'feature', domains: ['backend'], files: ['backend/src/foo.ts'] });
  assert.deepEqual(plan.capabilities, []);
});

test('five project-owned execution skills exist outside the 2-4 domain skill registry', () => {
  const ids = [
    'contagest-batch',
    'contagest-loop',
    'contagest-run-skill-generator',
    'contagest-fewer-permission-prompts',
    'contagest-skill-doctor',
  ];
  for (const id of ids) {
    assert.equal(fs.existsSync(new URL(`../.agents/execution-skills/${id}/SKILL.md`, import.meta.url)), true, `missing execution skill ${id}`);
  }

  const policy = JSON.parse(fs.readFileSync(new URL('../config/agent-execution-capabilities-v1.json', import.meta.url), 'utf8'));
  assert.equal(policy.domainSkillSlotsUnaffected, true);
  for (const id of ids) assert.ok(policy.capabilities[id], `missing execution capability contract ${id}`);
});
