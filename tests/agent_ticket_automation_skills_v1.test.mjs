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
function capability(plan, id) { return plan.capabilities.find((item) => item.id === id); }

test('batch requires independent work and never exceeds 30 workers', () => {
  const { planTicketAutomation } = requirePlanner();
  assert.equal(capability(planTicketAutomation({ signals: { independentWorkUnits: 4 } }), 'contagest-batch'), undefined);
  assert.equal(capability(planTicketAutomation({ signals: { independentWorkUnits: 12 } }), 'contagest-batch')?.workers, 12);
  assert.equal(capability(planTicketAutomation({ signals: { independentWorkUnits: 99 } }), 'contagest-batch')?.workers, 30);
});

test('ordered or destructive migration work is never auto-parallelized', () => {
  const { planTicketAutomation } = requirePlanner();
  assert.equal(capability(planTicketAutomation({ type: 'migration', boundaries: ['database','persistence'], signals: { independentWorkUnits: 20, orderedMutation: true } }), 'contagest-batch'), undefined);
});

test('loop is selected only for bounded recurring continuation with a stop condition', () => {
  const { planTicketAutomation } = requirePlanner();
  assert.equal(capability(planTicketAutomation({ signals: { waitingOnExternalState: true } }), 'contagest-loop'), undefined);
  const loop = capability(planTicketAutomation({ signals: { waitingOnExternalState: true, continuationAuthorized: true, stopCondition: 'required checks terminal' } }), 'contagest-loop');
  assert.equal(loop?.sessionBound, true);
  assert.equal(loop?.stopCondition, 'required checks terminal');
});

test('runtime/bootstrap changes select run-skill-generator without secret capture', () => {
  const { inferTicketAutomationSignals, planTicketAutomation } = requirePlanner();
  assert.equal(inferTicketAutomationSignals({ files: ['package.json','backend/package.json'] }).runtimeRecipeDrift, true);
  assert.equal(capability(planTicketAutomation({ files: ['package.json'] }), 'contagest-run-skill-generator')?.recordSecretValues, false);
});

test('repeated prompts select recommendation-first permission optimization', () => {
  const { planTicketAutomation } = requirePlanner();
  const permission = capability(planTicketAutomation({ signals: { repeatedPermissionPrompts: 3 } }), 'contagest-fewer-permission-prompts');
  assert.equal(permission?.autoApply, false);
  assert.equal(permission?.scope, 'project');
  assert.equal(permission?.lowRiskOnly, true);
});

test('agent and skill surface changes automatically select read-only skill-doctor', () => {
  const { inferTicketAutomationSignals, planTicketAutomation } = requirePlanner();
  assert.equal(inferTicketAutomationSignals({ files: ['.agents/skills/example/SKILL.md'] }).skillSurfaceChanged, true);
  assert.equal(capability(planTicketAutomation({ files: ['config/agent-skill-contracts-v3.json'] }), 'contagest-skill-doctor')?.readOnly, true);
});

test('small ordinary tickets do not receive unnecessary execution capabilities', () => {
  const { planTicketAutomation } = requirePlanner();
  assert.deepEqual(planTicketAutomation({ type: 'feature', domains: ['backend'], files: ['backend/src/foo.ts'] }).capabilities, []);
});

test('five project-owned execution skills exist outside the 2-4 domain skill registry', () => {
  const ids = ['contagest-batch','contagest-loop','contagest-run-skill-generator','contagest-fewer-permission-prompts','contagest-skill-doctor'];
  for (const id of ids) assert.equal(fs.existsSync(new URL(`../.agents/execution-skills/${id}/SKILL.md`, import.meta.url)), true, `missing execution skill ${id}`);
  const policy = JSON.parse(fs.readFileSync(new URL('../config/agent-execution-capabilities-v1.json', import.meta.url), 'utf8'));
  assert.equal(policy.domainSkillSlotsUnaffected, true);
  for (const id of ids) assert.ok(policy.capabilities[id], `missing execution capability contract ${id}`);
});

test('automation augments an existing route without consuming domain skill slots', () => {
  const { augmentAgentRoute } = requirePlanner();
  assert.equal(typeof augmentAgentRoute, 'function');
  const route = { schemaVersion: 3, files: ['config/agent-skill-contracts-v3.json'], task: { type: 'feature', risk: 'P1', boundaries: ['api'] }, domains: [{ id: 'agent-system', severity: 'high' }], skills: ['skill-a','skill-b','skill-c','skill-d'], routingPolicy: 'minimal-2-4-skills' };
  const augmented = augmentAgentRoute(route, { signals: { independentWorkUnits: 8 } });
  assert.deepEqual(augmented.skills, route.skills);
  assert.equal(augmented.skills.length, 4);
  assert.ok(augmented.executionCapabilities.some((item) => item.id === 'contagest-batch'));
  assert.ok(augmented.executionCapabilities.some((item) => item.id === 'contagest-skill-doctor'));
  assert.equal(augmented.routingPolicy, 'minimal-2-4-skills+execution-capabilities-v1');
});

test('canonical ticket router exists and supports gates plus bootstrap composition', () => {
  const url = new URL('../scripts/agent-ticket-router.mjs', import.meta.url);
  assert.equal(fs.existsSync(url), true, 'missing canonical ticket automation router');
  const source = fs.readFileSync(url, 'utf8');
  assert.match(source, /agent-gate-router\.mjs/);
  assert.match(source, /agent-bootstrap\.mjs/);
  assert.match(source, /augmentAgentRoute/);
  assert.match(source, /--independent-units/);
  assert.match(source, /--permission-prompts/);
  assert.match(source, /--waiting-external/);
});

test('project authority requires ticket capability reevaluation at development checkpoints', () => {
  const agents = fs.readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  const context = fs.readFileSync(new URL('../.agents/context/AGENT_SYSTEM_V3.md', import.meta.url), 'utf8');
  const ticketPolicy = fs.readFileSync(new URL('../.agents/TICKET_EXECUTION_POLICY.md', import.meta.url), 'utf8');
  for (const source of [agents, context, ticketPolicy]) {
    assert.match(source, /agent-ticket-router\.mjs/);
    assert.match(source, /execution capabilities/i);
    assert.match(source, /\.agents\/execution-skills/);
  }
  assert.match(agents, /2–4 ACTIVE project skills/);
  assert.match(agents, /30/);
  assert.match(ticketPolicy, /re-evaluate/i);
  assert.match(ticketPolicy, /permission prompts/i);
});
