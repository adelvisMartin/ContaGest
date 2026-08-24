import { spawnSync } from 'node:child_process';

const root=process.cwd();
const isVercel=Boolean(process.env.VERCEL);
const isPreview=process.env.VERCEL_ENV==='preview';
const pr=String(process.env.VERCEL_GIT_PULL_REQUEST_ID||'').trim();

if(isVercel&&(!isPreview||!pr)){
  console.log(`[browser-preqa] Skip: Vercel ${process.env.VERCEL_ENV||'unknown'} build is not a pull-request preview.`);
  process.exit(0);
}

function run(command,args,env={}){
  console.log(`[browser-preqa] ${command} ${args.join(' ')}`);
  const result=spawnSync(command,args,{cwd:root,stdio:'inherit',env:{...process.env,...env}});
  if(result.error){console.error(`[browser-preqa] ${result.error.message}`);process.exit(1);}
  if(result.status!==0)process.exit(result.status||1);
}

// Vercel installs from the frontend workspace and can omit root devDependencies.
// The repository already locks @playwright/test at the root, so materialize the
// existing lock graph here rather than downloading an unpinned CLI via npx.
run('npm',['install','--include=dev','--ignore-scripts','--no-audit','--no-fund']);
run('npx',['--no-install','playwright','install','chromium']);
run('npx',['--no-install','playwright','test',
  'qa/login-auth-runtime-v161.spec.mjs',
  'qa/erp-functional-smoke-v14.spec.mjs',
  'qa/ui-controls-runtime-v16.spec.mjs',
  '--project=chromium'
],{
  CI:'1',
  PLAYWRIGHT_HTML_OPEN:'never'
});
console.log('[browser-preqa][PASS] Chromium auth/login + functional smoke + 58-route runtime control audit passed.');
