import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const databaseUrl=String(process.env.DATABASE_URL||process.env.DIRECT_DATABASE_URL||'');
if(String(process.env.NODE_ENV||'').toLowerCase()==='production')throw new Error('58/75 real-browser gate refuses production.');
if(!/127\.0\.0\.1|localhost/.test(databaseUrl))throw new Error('58/75 requires an isolated local PostgreSQL URL.');

const run=String(process.env.CG_REAL_BROWSER_RUN||`${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0,6).toUpperCase()}`);
const env={...process.env,CG_REAL_BROWSER_RUN:run,VITE_API_BASE_URL:'http://127.0.0.1:3030/api/v1',PORT:'3030'};
const spawnOpts={cwd:process.cwd(),env,stdio:'inherit'};

function command(cmd,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(cmd,args,spawnOpts);
    child.once('error',reject);
    child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(`${cmd} ${args.join(' ')} exited ${code??signal}`)));
  });
}

async function waitForHealth(){
  const deadline=Date.now()+30_000;
  let last='';
  while(Date.now()<deadline){
    try{
      const response=await fetch('http://127.0.0.1:3030/health',{cache:'no-store'});
      if(response.ok)return;
      last=`HTTP ${response.status}`;
    }catch(error){last=String(error?.message||error);}
    await new Promise((resolve)=>setTimeout(resolve,200));
  }
  throw new Error(`Backend health did not become ready: ${last}`);
}

function stop(child){
  if(!child||child.exitCode!==null)return Promise.resolve();
  child.kill('SIGTERM');
  return new Promise((resolve)=>{
    const timer=setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');resolve();},5_000);
    child.once('exit',()=>{clearTimeout(timer);resolve();});
  });
}

let backend;
let failure;
try{
  await command('npm',['--workspace','backend','exec','--','tsx','../qa/support/real-browser-fixtures-v5875.ts','setup']);
  backend=spawn('npm',['--workspace','backend','exec','--','tsx','src/server.ts'],spawnOpts);
  await waitForHealth();
  await command('npx',['playwright','test','qa/erp-real-browser-v5875.spec.mjs','--project=chromium','--workers=1','--reporter=list']);
}catch(error){
  failure=error;
}finally{
  await stop(backend).catch(()=>undefined);
  await command('npm',['--workspace','backend','exec','--','tsx','../qa/support/real-browser-fixtures-v5875.ts','cleanup']).catch((error)=>{
    failure=failure||error;
    console.error('[58/75] cleanup failed:',error.message);
  });
}
if(failure)throw failure;
console.log(`[58/75][PASS] real browser -> API -> PostgreSQL run ${run}`);
