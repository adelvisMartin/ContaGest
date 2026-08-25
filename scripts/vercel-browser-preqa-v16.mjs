import { spawnSync } from 'node:child_process';
import { MODULE_VISUAL_CATALOG } from '../qa/support/module-visual-catalog.mjs';

const root=process.cwd();
const isVercel=Boolean(process.env.VERCEL);
const isPreview=process.env.VERCEL_ENV==='preview';
const pr=String(process.env.VERCEL_GIT_PULL_REQUEST_ID||'').trim();
const gitRef=String(process.env.VERCEL_GIT_COMMIT_REF||'').trim();
const isPostMerge58x5=gitRef==='qa/postmerge-58x5-verification';
const SERVERLESS_CHROMIUM_VERSION='149.0.0';

if(isVercel&&(!isPreview||(!pr&&!isPostMerge58x5))){
  console.log(`[browser-preqa] Skip: Vercel ${process.env.VERCEL_ENV||'unknown'} build is not an approved PR/58x5 preview (${gitRef||'no-ref'}).`);
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

if(isPostMerge58x5){
  console.log('\n[browser-preqa] ===== REAL BACKEND / POSTGRES PERSISTENCE =====');
  execute('npm',['run','test:backend:persistence:real']);
  console.log('\n[browser-preqa] ===== REACT DOCTOR CHANGED =====');
  execute('npm',['run','doctor:changed']);
  console.log('\n[browser-preqa] ===== REACT DOCTOR DESIGN =====');
  execute('npm',['run','doctor:design']);
}

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

function regexEscape(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function routeBatches(size=6){
  const routes=MODULE_VISUAL_CATALOG.map((item)=>item.route);
  const result=[];
  for(let index=0;index<routes.length;index+=size)result.push(routes.slice(index,index+size));
  return result;
}

// Vercel's serverless Chromium can terminate the browser context under very long
// suites. Keep logical flows isolated and execute the exhaustive 58-route audit
// in small deterministic batches. Each route is still its own Playwright test.
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

if(isPostMerge58x5){
  routeBatches(6).forEach((routes,index)=>{
    const pattern=`^(?:${routes.map(regexEscape).join('|')}) · deep desktop/mobile light/dark audit$`;
    runGroup(`58x5 exhaustive views batch ${index+1}/${Math.ceil(MODULE_VISUAL_CATALOG.length/6)} [${routes.join(', ')}]`,['qa/exhaustive-route-v164.spec.mjs','--grep',pattern]);
  });
  runGroup('58x5 route transition: sequential all routes',['qa/route-transition-v164.spec.mjs','--grep','all registered protected routes']);
  runGroup('58x5 route transition: rapid async navigation',['qa/route-transition-v164.spec.mjs','--grep','rapid navigation']);
  runGroup('58x5 route transition: command palette real navigation',['qa/route-transition-v164.spec.mjs','--grep','real command palette']);
}

if(failures.length){console.error(`\n[browser-preqa] ${failures.length} grupo(s) fallaron:`);failures.forEach((item)=>console.error(` - ${item.label} (exit ${item.status})`));process.exit(1);}
console.log('\n[browser-preqa][PASS] Auth, navegación, controles, responsive y auditoría 58x5 ejecutados sin fallos en Chromium.');
