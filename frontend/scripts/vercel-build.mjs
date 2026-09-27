import { spawnSync } from 'node:child_process';

// DIAGNOSTIC-ONLY branch probe. Never merge this reduced stage list.
const stages = Object.freeze([
  { id:'backend-typecheck', command:'npm', args:['--workspace','backend','run','typecheck'], cwd:'..' }
]);

function runStage(stage, index) {
  const startedAt = Date.now();
  console.log(`[vercel-probe][START] stage=${stage.id}`);
  const result = spawnSync(stage.command, stage.args, {
    stdio: 'inherit', env: process.env, shell: false, cwd: stage.cwd
  });
  const elapsedMs = Date.now() - startedAt;
  if (result.error) {
    console.error(`[vercel-probe][ERROR] stage=${stage.id} elapsedMs=${elapsedMs} spawn=${result.error.message}`);
    process.exitCode = 71 + index;
    return false;
  }
  if (result.status !== 0) {
    console.error(`[vercel-probe][FAIL] stage=${stage.id} elapsedMs=${elapsedMs} exit=${result.status ?? 'null'} signal=${result.signal || 'none'}`);
    process.exitCode = Number(result.status || 1);
    return false;
  }
  console.log(`[vercel-probe][PASS] stage=${stage.id} elapsedMs=${elapsedMs}`);
  return true;
}

for (let index = 0; index < stages.length; index += 1) {
  if (!runStage(stages[index], index)) break;
}
