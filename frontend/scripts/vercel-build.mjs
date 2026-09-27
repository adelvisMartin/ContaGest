import { spawnSync } from 'node:child_process';

// DIAGNOSTIC-ONLY: encode the failing production build stage in the process exit code.
// 71 identity, 72 source-qa, 73 browser-qa, 74 backend-stage, 75 vite-build.
const stages = Object.freeze([
  { id:'identity', command:'npm', args:['run','build:identity'] },
  { id:'source-qa', command:'npm', args:['run','preqa:source'] },
  { id:'browser-qa', command:'npm', args:['run','preqa:browser'] },
  { id:'backend-stage', command:'npm', args:['run','stage:backend'] },
  { id:'vite-build', command:'vite', args:['build'] }
]);

for (let index = 0; index < stages.length; index += 1) {
  const stage = stages[index];
  const result = spawnSync(stage.command, stage.args, {
    stdio: 'inherit',
    env: process.env,
    shell: false
  });

  if (result.error || result.status !== 0) {
    process.exitCode = 71 + index;
    break;
  }
}
