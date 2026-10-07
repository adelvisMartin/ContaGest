#!/usr/bin/env node
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { augmentAgentRoute } from './agent-ticket-automation-lib.mjs';

const argv = process.argv.slice(2);
const mode = argv[0];
const forwarded = argv.slice(1);

if (!['gates', 'bootstrap'].includes(mode)) {
  console.error('Usage: node scripts/agent-ticket-router.mjs <gates|bootstrap> [agent args] [automation signals]');
  process.exit(2);
}

const valueOf = (flag) => {
  const index = forwarded.indexOf(flag);
  return index >= 0 ? forwarded[index + 1] || '' : '';
};
const has = (flag) => forwarded.includes(flag);
const positiveInteger = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};

const signals = {
  independentWorkUnits: positiveInteger(valueOf('--independent-units')),
  repeatedPermissionPrompts: positiveInteger(valueOf('--permission-prompts')),
  waitingOnExternalState: has('--waiting-external'),
  continuationAuthorized: has('--continuation-authorized'),
  stopCondition: valueOf('--stop-condition'),
  orderedMutation: has('--ordered-mutation'),
  destructiveMutation: has('--destructive-mutation'),
};

const automationFlagsWithValues = new Set(['--independent-units', '--permission-prompts', '--stop-condition']);
const automationBooleanFlags = new Set(['--waiting-external', '--continuation-authorized', '--ordered-mutation', '--destructive-mutation']);
const delegateArgs = [];
for (let index = 0; index < forwarded.length; index += 1) {
  const arg = forwarded[index];
  if (automationFlagsWithValues.has(arg)) {
    index += 1;
    continue;
  }
  if (automationBooleanFlags.has(arg)) continue;
  delegateArgs.push(arg);
}
if (mode === 'bootstrap' && !delegateArgs.includes('--json')) delegateArgs.push('--json');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const delegate = path.join(scriptDir, mode === 'gates' ? 'agent-gate-router.mjs' : 'agent-bootstrap.mjs');
const raw = execFileSync(process.execPath, [delegate, ...delegateArgs], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});

let route;
try {
  route = JSON.parse(raw);
} catch {
  console.error(`CONTAGEST_TICKET_ROUTER_BLOCKED ${mode} delegate did not return JSON`);
  process.exit(2);
}

console.log(JSON.stringify(augmentAgentRoute(route, { signals }), null, 2));
