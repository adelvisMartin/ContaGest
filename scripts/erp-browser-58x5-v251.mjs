import { spawnSync } from 'node:child_process';
import { MODULE_VISUAL_CATALOG } from '../qa/support/module-visual-catalog.mjs';

const root=process.cwd();
const BATCH_SIZE=6;
const mode=String(process.argv[2]||'full').trim();
const failures=[];

function regexEscape(value){
  return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

function routeBatches(size=BATCH_SIZE){
  const routes=MODULE_VISUAL_CATALOG.map((item)=>item.route);
  const batches=[];
  for(let index=0;index<routes.length;index+=size)batches.push(routes.slice(index,index+size));
  return batches;
}

function runGroup(label,args,{env={}}={}){
  console.log('\n[erp-58x5] ===== '+label+' =====');
  const result=spawnSync('npx',['--no-install','playwright','test',...args,'--project=chromium','--workers=1'],{
    cwd:root,
    stdio:'inherit',
    env:{...process.env,CI:'1',PLAYWRIGHT_HTML_OPEN:'never',...env}
  });
  if(result.error){
    failures.push({label,status:1,error:result.error.message});
    console.error('[erp-58x5][FAIL] '+label+': '+result.error.message);
    return;
  }
  if(result.status!==0){
    failures.push({label,status:result.status||1});
    console.error('[erp-58x5][FAIL] '+label);
    return;
  }
  console.log('[erp-58x5][PASS] '+label);
}

function runCore(){
  runGroup('auth + login runtime',['qa/login-auth-runtime-v161.spec.mjs']);
  runGroup('2/51 vertical Wave A geometry',['qa/erp-ui-wave-a-v251.spec.mjs']);
  runGroup('58-route functional smoke',['qa/erp-functional-smoke-v14.spec.mjs']);
  runGroup('58-route controls/icons',['qa/ui-controls-runtime-v16.spec.mjs']);
  runGroup('mobile deep 360/390/430 + shell contrast',['qa/mobile-deep-v162.spec.mjs']);
  runGroup('observable safe click-smoke',['qa/module-actions-runtime-v163.spec.mjs']);
  runGroup('58x5 route transitions',['qa/route-transition-v164.spec.mjs']);
  runGroup('mobile command navigation',['qa/mobile-navigation-v163.spec.mjs','--grep','command palette opens']);
}

function runShard(index){
  const batches=routeBatches();
  if(!Number.isInteger(index)||index<0||index>=batches.length){
    throw new Error('CG_58X5_BATCH_INDEX must be an integer from 0 to '+(batches.length-1)+'; received '+index);
  }
  const routes=batches[index];
  const routePattern='(?:'+routes.map(regexEscape).join('|')+')';
  console.log('[erp-58x5] shard='+(index+1)+'/'+batches.length+' routes='+routes.join(','));
  runGroup('fine composition shard '+(index+1)+'/'+batches.length,[
    'qa/fine-composition-v166.spec.mjs','--grep',routePattern+' · fine composition desktop/mobile'
  ]);
  runGroup('exhaustive responsive shard '+(index+1)+'/'+batches.length,[
    'qa/exhaustive-route-v164.spec.mjs','--grep',routePattern+' · deep desktop/mobile light/dark audit'
  ]);
  runGroup('mobile sidebar shard '+(index+1)+'/'+batches.length,[
    'qa/mobile-navigation-v163.spec.mjs','--grep','every actual sidebar route button'
  ],{env:{CG_MOBILE_NAV_BATCH_INDEX:String(index),CG_MOBILE_NAV_BATCH_SIZE:String(BATCH_SIZE)}});
}

if(MODULE_VISUAL_CATALOG.length!==58){
  throw new Error('58x5 catalog drift: expected 58 routes, received '+MODULE_VISUAL_CATALOG.length);
}

if(mode==='core')runCore();
else if(mode==='shard')runShard(Number(process.env.CG_58X5_BATCH_INDEX));
else if(mode==='full'){
  runCore();
  routeBatches().forEach((_,index)=>runShard(index));
}else{
  throw new Error('Unknown ERP 58x5 mode: '+mode);
}

if(failures.length){
  console.error('\n[erp-58x5] '+failures.length+' group(s) failed:');
  failures.forEach((item)=>console.error(' - '+item.label+' (exit '+item.status+')'));
  process.exit(1);
}

console.log('\n[erp-58x5][PASS] mode='+mode+' complete with '+MODULE_VISUAL_CATALOG.length+' canonical routes.');
