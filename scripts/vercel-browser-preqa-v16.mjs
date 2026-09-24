import { spawnSync } from 'node:child_process';
const root=process.cwd();
const isVercel=Boolean(process.env.VERCEL);
const isPreview=process.env.VERCEL_ENV==='preview';
const pr=String(process.env.VERCEL_GIT_PULL_REQUEST_ID||'').trim();
const gitRef=String(process.env.VERCEL_GIT_COMMIT_REF||'').trim();
const isPostMerge58x5=gitRef==='qa/postmerge-58x5-verification';
const SERVERLESS_CHROMIUM_VERSION='149.0.0';
const failures=[];

if(isVercel&&(!isPreview||(!pr&&!isPostMerge58x5))){
  console.log(`[browser-preqa] Skip: Vercel ${process.env.VERCEL_ENV||'unknown'} build is not an approved PR/58x5 preview (${gitRef||'no-ref'}).`);
  process.exit(0);
}

function execute(command,args,{env={},capture=false,allowFailure=false}={}){
  console.log(`[browser-preqa] ${command} ${args.join(' ')}`);
  const result=spawnSync(command,args,{cwd:root,stdio:capture?'pipe':'inherit',encoding:capture?'utf8':undefined,env:{...process.env,...env}});
  if(result.error){
    console.error(`[browser-preqa] ${result.error.message}`);
    if(!allowFailure)process.exit(1);
    return{...result,status:result.status||1};
  }
  if(result.status!==0&&!allowFailure){
    if(capture){if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);}
    process.exit(result.status||1);
  }
  return result;
}

function runCommandGate(label,command,args,{env={}}={}){
  console.log(`\n[browser-preqa] ===== ${label} =====`);
  const result=execute(command,args,{env,allowFailure:true});
  if(result.status!==0){
    failures.push({label,status:result.status||1});
    console.error(`[browser-preqa][FAIL/BLOCKED] ${label}`);
  }else console.log(`[browser-preqa][PASS] ${label}`);
  return result;
}

// Vercel's top-level install is deliberately `npm ci` (see vercel.json).
// Re-running a generic `npm install` here would mutate the locked dependency
// graph immediately before QA. Reuse that deterministic workspace install and
// add only the exact serverless Chromium runtime required by this preview gate.
if(isPostMerge58x5){
  // Vercel preview is the browser/composition authority only. Real PostgreSQL
  // persistence and financial-domain gates remain available as standalone
  // scripts for a runner that can provide an isolated database.
  runCommandGate('REACT DOCTOR CHANGED','npm',['run','doctor:changed']);
  runCommandGate('REACT DOCTOR DESIGN','npm',['run','doctor:design']);
}

execute('npm',['install','--no-save','--package-lock=false','--ignore-scripts','--no-audit','--no-fund',`@sparticuz/chromium@${SERVERLESS_CHROMIUM_VERSION}`]);
execute('npx',['--no-install','playwright','install','ffmpeg']);

const probeSource=`import chromium from '@sparticuz/chromium';import { chromium as playwrightChromium } from 'playwright';chromium.setGraphicsMode=false;const executablePath=await chromium.executablePath();const args=chromium.args;const browser=await playwrightChromium.launch({executablePath,args,headless:true});await browser.close();const runtimeEnv={LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH||'',FONTCONFIG_PATH:process.env.FONTCONFIG_PATH||'',HOME:process.env.HOME||''};process.stdout.write('__CG_CHROMIUM__'+JSON.stringify({executablePath,args,runtimeEnv,launchVerified:true}));`;
const probe=execute(process.execPath,['--input-type=module','--eval',probeSource],{capture:true});
const marker='__CG_CHROMIUM__',markerIndex=String(probe.stdout||'').lastIndexOf(marker);
if(markerIndex<0){console.error('[browser-preqa] No se pudo resolver Chromium serverless.');process.exit(1);}
let browserConfig;
try{browserConfig=JSON.parse(String(probe.stdout).slice(markerIndex+marker.length));}catch(error){console.error(`[browser-preqa] Configuración Chromium inválida: ${error.message}`);process.exit(1);}
if(!browserConfig?.executablePath||!Array.isArray(browserConfig?.args))process.exit(1);
if(browserConfig.launchVerified!==true){console.error('[browser-preqa] Chromium serverless no superó el smoke launch real.');process.exit(1);}

const browserEnv={...browserConfig.runtimeEnv,CI:'1',PLAYWRIGHT_HTML_OPEN:'never',CG_PLAYWRIGHT_CHROMIUM_EXECUTABLE:browserConfig.executablePath,CG_PLAYWRIGHT_CHROMIUM_ARGS:JSON.stringify(browserConfig.args)};
function runGroup(label,args,{env={}}={}){
  console.log(`\n[browser-preqa] ===== ${label} =====`);
  const result=execute('npx',['--no-install','playwright','test',...args,'--project=chromium','--workers=1'],{env:{...browserEnv,...env},allowFailure:true});
  if(result.status!==0){failures.push({label,status:result.status||1});console.error(`[browser-preqa][FAIL] ${label}`);}else console.log(`[browser-preqa][PASS] ${label}`);
}

// Fast, high-signal navigation/auth checks first. They must report before long route matrices.
runGroup('auth stale-session rejection',['qa/login-auth-runtime-v161.spec.mjs','--grep','stale local session']);
runGroup('login desktop geometry',['qa/login-auth-runtime-v161.spec.mjs','--grep','desktop login']);
runGroup('login mobile 360px',['qa/login-auth-runtime-v161.spec.mjs','--grep','mobile login 360px']);
runGroup('login mobile 390px',['qa/login-auth-runtime-v161.spec.mjs','--grep','mobile login 390px']);
runGroup('login mobile 430px',['qa/login-auth-runtime-v161.spec.mjs','--grep','mobile login 430px']);
runGroup('mobile command navigation',['qa/mobile-navigation-v163.spec.mjs','--grep','command palette opens']);

if(isPostMerge58x5)runGroup('2/51 vertical Wave A geometry',['qa/erp-ui-wave-a-v251.spec.mjs']);

runGroup('58-route mount + DOM integrity',['qa/erp-functional-smoke-v14.spec.mjs','--grep','58 registered routes']);
runGroup('psychology create-appointment flow',['qa/erp-functional-smoke-v14.spec.mjs','--grep','psychology creates an appointment']);
runGroup('sidebar compact/group lifecycle',['qa/erp-functional-smoke-v14.spec.mjs','--grep','sidebar is mode-scoped']);
runGroup('light/dark geometry parity',['qa/erp-functional-smoke-v14.spec.mjs','--grep','dark/light share geometry']);
runGroup('58-route runtime button/icon/React contracts',['qa/ui-controls-runtime-v16.spec.mjs']);
runGroup('mobile deep 360px',['qa/mobile-deep-v162.spec.mjs','--grep','inside 360px']);
runGroup('mobile deep 390px',['qa/mobile-deep-v162.spec.mjs','--grep','inside 390px']);
runGroup('mobile deep 430px',['qa/mobile-deep-v162.spec.mjs','--grep','inside 430px']);
runGroup('mobile shell + light/dark contrast',['qa/mobile-deep-v162.spec.mjs','--grep','mobile shell controls']);

runGroup('observable safe click-smoke',['qa/module-actions-runtime-v163.spec.mjs']);

if(isPostMerge58x5)console.log('[browser-preqa] Full 58x5 route/composition/navigation/transition matrix is delegated to .github/workflows/erp-ui-58x5-v251.yml; Vercel preview keeps high-signal smoke + Wave A geometry only.');

if(failures.length){
  console.error(`\n[browser-preqa] ${failures.length} gate/grupo(s) quedaron FAIL o BLOCKED:`);
  failures.forEach((item)=>console.error(` - ${item.label} (exit ${item.status})`));
  process.exit(1);
}
console.log('\n[browser-preqa][PASS] Navegación, controles, responsive y smoke Chromium de alta señal sin fallos. La matriz exhaustiva 58x5 y PostgreSQL se ejecutan en workflows dedicados.');
