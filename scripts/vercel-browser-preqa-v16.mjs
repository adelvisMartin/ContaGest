import { spawnSync } from 'node:child_process';

const root=process.cwd();
const isVercel=Boolean(process.env.VERCEL);
const isPreview=process.env.VERCEL_ENV==='preview';
const pr=String(process.env.VERCEL_GIT_PULL_REQUEST_ID||'').trim();
const SERVERLESS_CHROMIUM_VERSION='149.0.0';

if(isVercel&&(!isPreview||!pr)){
  console.log(`[browser-preqa] Skip: Vercel ${process.env.VERCEL_ENV||'unknown'} build is not a pull-request preview.`);
  process.exit(0);
}

function execute(command,args,{env={},capture=false}={}){
  console.log(`[browser-preqa] ${command} ${args.join(' ')}`);
  const result=spawnSync(command,args,{
    cwd:root,
    stdio:capture?'pipe':'inherit',
    encoding:capture?'utf8':undefined,
    env:{...process.env,...env}
  });
  if(result.error){console.error(`[browser-preqa] ${result.error.message}`);process.exit(1);}
  if(result.status!==0){
    if(capture){if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);}
    process.exit(result.status||1);
  }
  return result;
}

// Vercel installs from the frontend workspace and can omit root devDependencies.
// Materialize the repository-pinned Playwright tools first.
execute('npm',['install','--include=dev','--ignore-scripts','--no-audit','--no-fund']);

// Vercel's minimal build image has neither libnspr4 nor apt-get. Use an exact,
// serverless Chromium build instead of weakening/skipping the browser gate.
// This package is QA-only and installed with --no-save so production runtime
// dependencies and the committed lock graph remain untouched.
execute('npm',['install','--no-save','--ignore-scripts','--no-audit','--no-fund',`@sparticuz/chromium@${SERVERLESS_CHROMIUM_VERSION}`]);

const probeSource=`
  import chromium from '@sparticuz/chromium';
  chromium.setGraphicsMode=false;
  const executablePath=await chromium.executablePath();
  const runtimeEnv={
    LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH||'',
    FONTCONFIG_PATH:process.env.FONTCONFIG_PATH||'',
    HOME:process.env.HOME||''
  };
  process.stdout.write('__CG_CHROMIUM__'+JSON.stringify({executablePath,args:chromium.args,runtimeEnv}));
`;
const probe=execute(process.execPath,['--input-type=module','--eval',probeSource],{capture:true});
const marker='__CG_CHROMIUM__';
const markerIndex=String(probe.stdout||'').lastIndexOf(marker);
if(markerIndex<0){
  console.error('[browser-preqa] No se pudo resolver el Chromium serverless fijado.');
  if(probe.stdout)process.stdout.write(probe.stdout);
  if(probe.stderr)process.stderr.write(probe.stderr);
  process.exit(1);
}
let browserConfig;
try{browserConfig=JSON.parse(String(probe.stdout).slice(markerIndex+marker.length));}
catch(error){console.error(`[browser-preqa] Configuración Chromium inválida: ${error.message}`);process.exit(1);}
if(!browserConfig?.executablePath||!Array.isArray(browserConfig?.args)){
  console.error('[browser-preqa] Chromium serverless no devolvió executablePath/args válidos.');
  process.exit(1);
}
if(!String(browserConfig.runtimeEnv?.LD_LIBRARY_PATH||'').includes('/tmp/al2023/lib')){
  console.error(`[browser-preqa] La capa AL2023 no quedó activa: ${browserConfig.runtimeEnv?.LD_LIBRARY_PATH||'(vacío)'}`);
  process.exit(1);
}
console.log(`[browser-preqa] Chromium serverless ${SERVERLESS_CHROMIUM_VERSION}: ${browserConfig.executablePath}`);
console.log(`[browser-preqa] AL2023 libs: ${browserConfig.runtimeEnv.LD_LIBRARY_PATH}`);

execute('npx',['--no-install','playwright','test',
  'qa/login-auth-runtime-v161.spec.mjs',
  'qa/erp-functional-smoke-v14.spec.mjs',
  'qa/ui-controls-runtime-v16.spec.mjs',
  '--project=chromium'
],{env:{
  ...browserConfig.runtimeEnv,
  CI:'1',
  PLAYWRIGHT_HTML_OPEN:'never',
  CG_PLAYWRIGHT_CHROMIUM_EXECUTABLE:browserConfig.executablePath,
  CG_PLAYWRIGHT_CHROMIUM_ARGS:JSON.stringify(browserConfig.args)
}});
console.log('[browser-preqa][PASS] Chromium auth/login + functional smoke + 58-route runtime control audit passed.');
