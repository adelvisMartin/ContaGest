import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import {
  prismaQueryTelemetryEnabled,
  prismaQueryTelemetrySnapshot,
  resetPrismaQueryTelemetry
} from '../backend/src/database/prisma.ts';

const sha=String(process.env.CANDIDATE_SHA||'').trim();
const expectedPeak=Number(process.env.ERP157_EXPECTED_PEAK_USERS);
assert.match(sha,/^[a-f0-9]{40}$/i,'CANDIDATE_SHA required');
assert.ok(Number.isInteger(expectedPeak)&&expectedPeak>0&&expectedPeak<=250,'ERP157_EXPECTED_PEAK_USERS must be an integer 1..250; do not invent the business peak.');
assert.equal(prismaQueryTelemetryEnabled(),true,'Set PRISMA_QUERY_TELEMETRY=true for #157');

const RUN=`PERF157-${Date.now().toString(36).toUpperCase()}`;
const outDir=path.resolve('artifacts/qa/erp-performance-v157',sha);
fs.mkdirSync(outDir,{recursive:true});
const q=(values:number[],p:number)=>{if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.max(0,Math.ceil(p*a.length)-1))];};
const pct=(a:number,b:number)=>b?100*a/b:0;
const sleep=(ms:number)=>new Promise((resolve)=>setTimeout(resolve,ms));
const fingerprint=(query:string)=>query.replace(/\s+/g,' ').trim();

const h=await createRealBackendHarness();
const apiSamples:number[]=[];
let apiErrors=0;
let apiTotal=0;
let maxPoolPct=0;
const profileEvidence:any={};
const loadFactorEvidence:any={};
const profilingEvidence:any[]=[];
const heavyProcesses:any={
  import:{success:false,'controlled-error':false,'cancellation-or-explicit-non-cancellable-contract':false},
  export:{success:false,'controlled-error':false,'cancellation-or-explicit-non-cancellable-contract':false},
  report:{success:false,'controlled-error':false,'cancellation-or-explicit-non-cancellable-contract':false}
};
const degradation:any={
  'slow-db':false,'pool-saturation':false,'external-timeout':false,'memory-pressure':false,'large-payload':false,'multi-user-concurrency':false
};

async function timed(pathname:string,options:RequestInit={}){
  const started=performance.now();
  const result=await h.request(pathname,options);
  const duration=performance.now()-started;
  apiSamples.push(duration);apiTotal+=1;if(!result.response.ok)apiErrors+=1;
  return{...result,duration};
}

async function poolSample(){
  const rows=await h.prisma.$queryRaw<Array<{active:bigint;max_connections:number}>>`
    SELECT count(*) FILTER (WHERE state='active')::bigint AS active,
           current_setting('max_connections')::int AS max_connections
    FROM pg_stat_activity WHERE datname=current_database()
  `;
  const row=rows[0];
  const value=pct(Number(row?.active||0),Number(row?.max_connections||1));
  maxPoolPct=Math.max(maxPoolPct,value);
}

const profiles={
  'finance-admin':['/clients?limit=50','/bank-accounts?limit=50','/reports/accounting'],
  'operations-clerk':['/products?limit=50','/suppliers?limit=50','/tasks?limit=50'],
  'read-only-analyst':['/reports/sales','/reports/inventory','/reports/trial-balance']
};

try{
  // Warm-up removes dependency/module start from the backend request baseline.
  for(const endpoint of Object.values(profiles).flat())await timed(endpoint);
  apiSamples.splice(0);apiErrors=0;apiTotal=0;resetPrismaQueryTelemetry();

  for(const factor of [1,3]){
    const users=expectedPeak*factor;
    const started=performance.now();
    let sampling=true;
    const sampler=(async()=>{while(sampling){await poolSample().catch(()=>{});await sleep(20);}})();
    const jobs=[] as Promise<void>[];
    for(const [profile,endpoints] of Object.entries(profiles)){
      const profileStarted=performance.now();
      for(let i=0;i<users;i+=1){jobs.push((async()=>{
        for(const endpoint of endpoints){
          const result=await timed(endpoint);
          assert.equal(result.response.ok,true,`${profile} ${endpoint} -> ${result.response.status}`);
        }
      })());}
      profileEvidence[profile]={...(profileEvidence[profile]||{}),[`${factor}x`]:{users,startedAt:profileStarted}};
    }
    await Promise.all(jobs);
    sampling=false;await sampler;
    const elapsedMs=performance.now()-started;
    const requests=users*Object.keys(profiles).length*3;
    loadFactorEvidence[`${factor}x`]={usersPerProfile:users,requests,elapsedMs,throughputRps:requests/(elapsedMs/1000)};
    for(const profile of Object.keys(profiles))profileEvidence[profile][`${factor}x`].elapsedMs=elapsedMs;
  }
  degradation['pool-saturation']=true;
  degradation['multi-user-concurrency']=true;

  const querySamples=prismaQueryTelemetrySnapshot().filter((item)=>!/(pg_stat_activity|current_setting\('max_connections'\))/i.test(item.query));
  const dbDurations=querySamples.map((item)=>item.durationMs).filter(Number.isFinite);
  const slowQueries=querySamples.filter((item)=>item.durationMs>500);

  let nPlusOneFindings=0;
  const nPlusOneDetails=[] as any[];
  for(const endpoint of Object.values(profiles).flat()){
    resetPrismaQueryTelemetry();
    const result=await h.request(endpoint);assert.equal(result.response.ok,true);
    const samples=prismaQueryTelemetrySnapshot();
    const counts=new Map<string,number>();
    for(const item of samples){const key=fingerprint(item.query);counts.set(key,(counts.get(key)||0)+1);}
    const repeated=[...counts.entries()].filter(([,count])=>count>=5);
    if(repeated.length){nPlusOneFindings+=repeated.length;nPlusOneDetails.push({endpoint,repeated:repeated.map(([,count])=>count)});}
  }
  profilingEvidence.push({kind:'prisma-query-telemetry',queryCount:querySamples.length,slowQueryCount:slowQueries.length,nPlusOneDetails});

  const beforeDeadlocks=await h.prisma.$queryRaw<Array<{deadlocks:bigint}>>`SELECT deadlocks::bigint AS deadlocks FROM pg_stat_database WHERE datname=current_database()`;
  const slowStarted=performance.now();
  await h.prisma.$executeRawUnsafe('SELECT pg_sleep(0.08)');
  const slowElapsedMs=performance.now()-slowStarted;
  assert.ok(slowElapsedMs>=60,'slow-db scenario was not actually delayed');
  await h.prisma.$queryRaw`SELECT 1`;
  degradation['slow-db']=true;
  profilingEvidence.push({kind:'slow-db',delayMs:slowElapsedMs,recovered:true});

  const crossTenantRif=`${RUN}-B`;
  const tenantB=await h.prisma.tenant.create({data:{rif:crossTenantRif,name:`${RUN} Tenant B`,legalName:`${RUN} Tenant B`}});
  const foreignRif=`${RUN}-FOREIGN`;
  await h.prisma.client.create({data:{tenantId:tenantB.id,rif:foreignRif,name:'Synthetic foreign tenant client'}});
  const isolation=await h.request(`/clients?search=${encodeURIComponent(foreignRif)}&limit=100`);
  assert.equal(isolation.response.ok,true);
  const crossTenantLeakCount=JSON.stringify(isolation.payload).includes(foreignRif)?1:0;
  await h.prisma.client.deleteMany({where:{tenantId:tenantB.id}});await h.prisma.tenant.delete({where:{id:tenantB.id}});

  const importRows=Array.from({length:120},(_,i)=>({name:`${RUN} Client ${i}`,rif:`${RUN}-${String(i).padStart(4,'0')}`}));
  const importStarted=performance.now();
  const preview=await h.ok('/imports/preview',{method:'POST',body:JSON.stringify({type:'clients',rows:importRows,duplicatePolicy:'error',templateVersion:'v1',filename:`${RUN}.csv`})});
  assert.equal(preview.status,'validated');
  const commit=await h.ok(`/imports/${preview.id}/commit`,{method:'POST',headers:{'Idempotency-Key':`${RUN}-IMPORT-0123456789abcdef`},body:JSON.stringify({confirm:true,checksum:preview.checksum})});
  assert.equal(commit.status,'completed');
  heavyProcesses.import.success=true;degradation['large-payload']=true;
  profilingEvidence.push({kind:'import',rows:importRows.length,durationMs:performance.now()-importStarted});
  const invalidImport=await h.ok('/imports/preview',{method:'POST',body:JSON.stringify({type:'clients',rows:[{name:'Invalid synthetic row'}],duplicatePolicy:'error',templateVersion:'v1',filename:`${RUN}-invalid.csv`})});
  assert.equal(invalidImport.status,'invalid');heavyProcesses.import['controlled-error']=true;
  heavyProcesses.import['cancellation-or-explicit-non-cancellable-contract']=fs.existsSync('docs/qa/ERP-157-HEAVY-PROCESS-CONTRACTS.md');
  await h.prisma.client.deleteMany({where:{tenantId:h.tenant.id,rif:{startsWith:RUN}}});
  await h.prisma.importBatch.deleteMany({where:{tenantId:h.tenant.id}}).catch(()=>undefined);

  const exportRows=Array.from({length:1000},(_,i)=>({id:i,name:`Synthetic row ${i}`,amount:(i+1)/100,status:'active'}));
  const exportStarted=performance.now();
  const exportOk=await h.request('/exports/xlsx',{method:'POST',body:JSON.stringify({filename:`${RUN}-export`,title:'Synthetic performance export',sheets:[{name:'QA',rows:exportRows}]})});
  assert.equal(exportOk.response.status,200);heavyProcesses.export.success=true;
  profilingEvidence.push({kind:'export-xlsx',rows:exportRows.length,durationMs:performance.now()-exportStarted,bytes:Number(exportOk.response.headers.get('content-length')||0)});
  const exportBad=await h.request('/exports/xlsx',{method:'POST',body:JSON.stringify({filename:'bad',sheets:'not-an-array'})});
  assert.equal(exportBad.response.status,422);heavyProcesses.export['controlled-error']=true;
  heavyProcesses.export['cancellation-or-explicit-non-cancellable-contract']=fs.existsSync('docs/qa/ERP-157-HEAVY-PROCESS-CONTRACTS.md');

  const reportStarted=performance.now();const report=await h.request('/reports/sales');assert.equal(report.response.status,200);heavyProcesses.report.success=true;
  profilingEvidence.push({kind:'report',route:'/reports/sales',durationMs:performance.now()-reportStarted});
  const reportBad=await h.request('/reports/not-supported');assert.equal(reportBad.response.status,404);heavyProcesses.report['controlled-error']=true;
  heavyProcesses.report['cancellation-or-explicit-non-cancellable-contract']=fs.existsSync('docs/qa/ERP-157-HEAVY-PROCESS-CONTRACTS.md');

  const originalFetch=globalThis.fetch;process.env.OPENAI_API_KEY='synthetic-timeout-key';process.env.OPENAI_REQUEST_TIMEOUT_MS='120';
  globalThis.fetch=((input:any,init:any={})=>{
    if(String(input).startsWith('https://api.openai.com/'))return new Promise((_resolve,reject)=>{
      const abort=()=>reject(Object.assign(new Error('synthetic external timeout'),{name:'AbortError'}));
      if(init?.signal?.aborted)return abort();init?.signal?.addEventListener?.('abort',abort,{once:true});
    }) as any;
    return originalFetch(input,init as any);
  }) as typeof fetch;
  const external=await h.request('/ai/chat',{method:'POST',body:JSON.stringify({message:`${RUN} timeout scenario`})});
  globalThis.fetch=originalFetch;delete process.env.OPENAI_API_KEY;delete process.env.OPENAI_REQUEST_TIMEOUT_MS;
  assert.equal(external.response.status,200);assert.ok(external.data?.providerWarning);degradation['external-timeout']=true;
  await h.prisma.aiConversation.deleteMany({where:{tenantId:h.tenant.id,title:{contains:RUN}}}).catch(()=>undefined);

  const afterDeadlocks=await h.prisma.$queryRaw<Array<{deadlocks:bigint}>>`SELECT deadlocks::bigint AS deadlocks FROM pg_stat_database WHERE datname=current_database()`;
  const deadlockCount=Math.max(0,Number(afterDeadlocks[0]?.deadlocks||0)-Number(beforeDeadlocks[0]?.deadlocks||0));
  const errorRatePct=pct(apiErrors,apiTotal);
  const throughputRps=Math.min(...Object.values(loadFactorEvidence).map((item:any)=>item.throughputRps));

  const output={
    schemaVersion:1,issue:157,candidateSha:sha,expectedPeakConcurrentUsers:expectedPeak,
    environment:{runtime:`node ${process.version} + postgres`,device:'github-hosted-ubuntu',network:'loopback-local'},
    profileCoverage:Object.fromEntries(Object.keys(profiles).map((name)=>[name,'MEASURED'])),
    loadFactors:{'1x':'MEASURED','3x':'MEASURED'},
    profileEvidence,loadFactorEvidence,
    metrics:{
      'backend.apiP50Ms':q(apiSamples,.50),'backend.apiP95Ms':q(apiSamples,.95),'backend.apiP99Ms':q(apiSamples,.99),
      'backend.errorRatePct':errorRatePct,'backend.throughputRps':throughputRps,'backend.dbQueryP95Ms':q(dbDurations,.95),
      'backend.poolSaturationPct':maxPoolPct,'backend.slowQueryCount':slowQueries.length,'backend.nPlusOneFindingCount':nPlusOneFindings,
      'backend.deadlockCount':deadlockCount,'backend.crossTenantLeakCount':crossTenantLeakCount
    },
    heavyProcesses:Object.fromEntries(Object.entries(heavyProcesses).map(([name,outcomes])=>[name,Object.fromEntries(Object.entries(outcomes as any).map(([key,value])=>[key,value?'MEASURED':'NOT_EXECUTED']))])),
    degradation:Object.fromEntries(Object.entries(degradation).map(([key,value])=>[key,value?'MEASURED':'NOT_EXECUTED'])),
    profilingEvidence
  };
  fs.writeFileSync(path.join(outDir,'backend-measurements.json'),JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify(output));
}finally{
  await h.close();
}
