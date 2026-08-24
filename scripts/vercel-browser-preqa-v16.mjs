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

function execute(command,args,{env={},capture=false,allowFailure=false}={}){
  console.log(`[browser-preqa] ${command} ${args.join(' ')}`);
  const result=spawnSync(command,args,{cwd:root,stdio:capture?'pipe':'inherit',encoding:capture?'utf8':undefined,env:{...process.env,...env}});
  if(result.error){console.error(`[browser-preqa] ${result.error.message}`);if(!allowFailure)process.exit(1);return{...result,status:result.status||1};}
  if(result.status!==0&&!allowFailure){if(capture){if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);}process.exit(result.status||1);}
  return result;
}

execute('npm',['install','--include=dev','--ignore-scripts','--no-audit','--no-fund']);
execute('npm',['install','--no-save','--ignore-scripts','--no-audit','--no-fund',`@sparticuz/chromium@${SERVERLESS_CHROMIUM_VERSION}`]);
execute('npx',['--no-install','playwright','install','ffmpeg']);

const probeSource=`
  import chromium from '@sparticuz/chromium';
  chromium.setGraphicsMode=false;
  const executablePath=await chromium.executablePath();
  const runtimeEnv={LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH||'',FONTCONFIG_PATH:process.env.FONTCONFIG_PATH||'',HOME:process.env.HOME||''};
  process.stdout.write('__CG_CHROMIUM__'+JSON.stringify({executablePath,args:chromium.args,runtimeEnv}));
`;
const probe=execute(process.execPath,['--input-type=module','--eval',probeSource],{capture:true});
const marker='__CG_CHROMIUM__',markerIndex=String(probe.stdout||'').lastIndexOf(marker);
if(markerIndex<0){console.error('[browser-preqa] No se pudo resolver el Chromium serverless fijado.');if(probe.stdout)process.stdout.write(probe.stdout);if(probe.stderr)process.stderr.write(probe.stderr);process.exit(1);}
let browserConfig;
try{browserConfig=JSON.parse(String(probe.stdout).slice(markerIndex+marker.length));}catch(error){console.error(`[browser-preqa] Configuración Chromium inválida: ${error.message}`);process.exit(1);}
if(!browserConfig?.executablePath||!Array.isArray(browserConfig?.args)){console.error('[browser-preqa] Chromium serverless no devolvió executablePath/args válidos.');process.exit(1);}
if(!String(browserConfig.runtimeEnv?.LD_LIBRARY_PATH||'').includes('/tmp/al2023/lib')){console.error(`[browser-preqa] La capa AL2023 no quedó activa: ${browserConfig.runtimeEnv?.LD_LIBRARY_PATH||'(vacío)'}`);process.exit(1);}
console.log(`[browser-preqa] Chromium serverless ${SERVERLESS_CHROMIUM_VERSION}: ${browserConfig.executablePath}`);

const browserEnv={...browserConfig.runtimeEnv,CI:'1',PLAYWRIGHT_HTML_OPEN:'never',CG_PLAYWRIGHT_CHROMIUM_EXECUTABLE:browserConfig.executablePath,CG_PLAYWRIGHT_CHROMIUM_ARGS:JSON.stringify(browserConfig.args)};
const failures=[];
function runGroup(label,args){
  console.log(`\n[browser-preqa] ===== ${label} =====`);
  const result=execute('npx',['--no-install','playwright','test',...args,'--project=chromium','--workers=1'],{env:browserEnv,allowFailure:true});
  if(result.status!==0){failures.push({label,status:result.status||1});console.error(`[browser-preqa][FAIL] ${label}`);}else console.log(`[browser-preqa][PASS] ${label}`);
}

// Vercel's serverless Chromium can terminate the whole browser context between
// tests even when the preceding assertion passed. Each logical browser test is
// therefore launched in its own Playwright process. Catalog-wide single tests
// remain one process because their internal route loop is the subject under test.
runGroup('auth stale-session rejection',['qa/login-auth-runtime-v161.spec.mjs','--grep','stale local session']);
runGroup('login desktop geometry',['qa/login-auth-runtime-v161.spec.mjs','--grep','desktop login']);
runGroup('login mobile 360px',['qa/login-auth-runtime-v161.spec.mjs','--grep','mobile login 360px']);
runGroup('login mobile 390px',['qa/login-auth-runtime-v161.spec.mjs','--grep','mobile login 390px']);
runGroup('login mobile 430px',['qa/login-auth-runtime-v161.spec.mjs','--grep','mobile login 430px']);
runGroup('58-route mount + DOM integrity',['qa/erp-functional-smoke-v14.spec.mjs','--grep','58 registered routes']);
runGroup('psychology create-appointment flow',['qa/erp-functional-smoke-v14.spec.mjs','--grep','psychology creates an appointment']);
runGroup('sidebar compact/group lifecycle',['qa/erp-functional-smoke-v14.spec.mjs','--grep','sidebar is mode-scoped']);
runGroup('light/dark geometry parity',['qa/erp-functional-smoke-v14.spec.mjs','--grep','dark/light share geometry']);
runGroup('58-route runtime button/icon/React contracts',['qa/ui-controls-runtime-v16.spec.mjs']);
runGroup('mobile deep 360px',['qa/mobile-deep-v162.spec.mjs','--grep','inside 360px']);
runGroup('mobile deep 390px',['qa/mobile-deep-v162.spec.mjs','--grep','inside 390px']);
runGroup('mobile deep 430px',['qa/mobile-deep-v162.spec.mjs','--grep','inside 430px']);
runGroup('mobile shell + light/dark contrast',['qa/mobile-deep-v162.spec.mjs','--grep','mobile shell controls']);
runGroup('mobile sidebar navigation',['qa/mobile-navigation-v163.spec.mjs','--grep','every actual sidebar route button']);
runGroup('mobile command navigation',['qa/mobile-navigation-v163.spec.mjs','--grep','command palette opens']);
runGroup('observable safe click-smoke',['qa/module-actions-runtime-v163.spec.mjs']);

if(failures.length){console.error(`\n[browser-preqa] ${failures.length} grupo(s) fallaron:`);failures.forEach((item)=>console.error(` - ${item.label} (exit ${item.status})`));process.exit(1);}
console.log('\n[browser-preqa][PASS] Todos los grupos aislados de auth, navegación, 58 rutas, 360/390/430, contraste y acciones observables pasaron.');
