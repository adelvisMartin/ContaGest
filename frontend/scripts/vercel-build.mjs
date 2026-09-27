import { spawnSync } from 'node:child_process';

const stages = Object.freeze([
  { id:'identity', command:'npm', args:['run','build:identity'] },
  { id:'source-qa', command:'npm', args:['run','preqa:source'] },
  { id:'browser-qa', command:'npm', args:['run','preqa:browser'] },
  { id:'backend-stage', command:'npm', args:['run','stage:backend'] },
  { id:'vite-build', command:'vite', args:['build'] }
]);

function safeBuildContext() {
  const sha = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || '').trim();
  const ref = String(process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || '').trim();
  const env = String(process.env.VERCEL_ENV || process.env.NODE_ENV || 'local').trim();
  return {
    sha: /^[a-f0-9]{40}$/i.test(sha) ? sha.toLowerCase() : 'unbound',
    ref: ref.slice(0, 160) || 'unknown',
    environment: env.slice(0, 40) || 'unknown',
    node: process.version
  };
}

function runStage(stage, index) {
  const startedAt = Date.now();
  const context = safeBuildContext();
  console.log(`[vercel-build][START] stage=${stage.id} index=${index + 1}/${stages.length} sha=${context.sha} ref=${context.ref} env=${context.environment} node=${context.node}`);

  const result = spawnSync(stage.command, stage.args, {
    stdio: 'inherit',
    env: process.env,
    shell: false
  });

  const elapsedMs = Date.now() - startedAt;

  if (result.error) {
    console.error(`[vercel-build][ERROR] stage=${stage.id} elapsedMs=${elapsedMs} spawn=${result.error.message}`);
    process.exitCode = 71 + index;
    return false;
  }

  if (result.status !== 0) {
    console.error(`[vercel-build][FAIL] stage=${stage.id} elapsedMs=${elapsedMs} exit=${result.status ?? 'null'} signal=${result.signal || 'none'}`);
    process.exitCode = Number(result.status || 1);
    return false;
  }

  console.log(`[vercel-build][PASS] stage=${stage.id} elapsedMs=${elapsedMs}`);
  return true;
}

for (let index = 0; index < stages.length; index += 1) {
  if (!runStage(stages[index], index)) break;
}

if (!process.exitCode) {
  const context = safeBuildContext();
  console.log(`[vercel-build][PASS] all-stages=${stages.length} sha=${context.sha}`);
}
