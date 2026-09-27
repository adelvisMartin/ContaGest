import { spawnSync } from 'node:child_process';

// DIAGNOSTIC-ONLY branch probe. Never merge this reduced stage list.
// This isolates the second half of preqa:source in the exact Vercel environment.
const stages = Object.freeze([
  { id:'backend-typecheck', command:'npm', args:['--workspace','backend','run','typecheck'], cwd:'..' },
  { id:'backend-config-tests', command:'npm', args:['--workspace','backend','run','test:config'], cwd:'..' },
  { id:'backend-hipico-tests', command:'npm', args:['--workspace','backend','run','test:hipico'], cwd:'..' },
  { id:'visual-source-gate', command:process.execPath, args:['scripts/visual-source-gate-v16.mjs'], cwd:'..' },
  { id:'functional-source-gate', command:process.execPath, args:['scripts/erp-functional-source-gate-v16.mjs'], cwd:'..' },
  { id:'ui-control-audit', command:process.execPath, args:['scripts/ui-control-audit-v16.mjs'], cwd:'..' }
]);

function safeBuildContext() {
  const sha = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || '').trim();
  return { sha: /^[a-f0-9]{40}$/i.test(sha) ? sha.toLowerCase() : 'unbound' };
}

function runStage(stage, index) {
  const startedAt = Date.now();
  console.log(`[vercel-probe][START] stage=${stage.id} index=${index + 1}/${stages.length}`);
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
if (!process.exitCode) console.log(`[vercel-probe][PASS] group=source-qa-second-half sha=${safeBuildContext().sha}`);
