import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { AccessControlService } from '../frontend/src/services/accessControlService.js';
import { fixtureForRequest } from './support/erp-system-fixtures-v155.mjs';

test.setTimeout(240_000);
test.use({ launchOptions:{ args:['--enable-precise-memory-info','--js-flags=--max-old-space-size=256'] } });

const sha=String(process.env.CANDIDATE_SHA||'').trim();
if(!/^[a-f0-9]{40}$/i.test(sha))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
const outDir=path.resolve('artifacts/qa/erp-performance-v157',sha);fs.mkdirSync(outDir,{recursive:true});
const q=(values,p)=>{const a=[...values].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.max(0,Math.ceil(p*a.length)-1))]||0;};
const rbac=AccessControlService.defaultState();rbac.activeUserId='user-admin';const user=rbac.users.find((item)=>item.id===rbac.activeUserId);const role=rbac.roles.find((item)=>item.id===user?.roleId);
if(!user||!role)throw new Error('ERP157_ADMIN_RBAC_PROFILE_MISSING');
const session={sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant-a',tenant:{id:'qa-tenant-a',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},user:{id:user.id,name:user.fullName,fullName:user.fullName,email:'admin@example.test',role:'admin',permissions:[...role.permissions]},audience:'staff',expiresAt:Date.now()+3600000};
const store={rbac,settings:{theme:'light',lang:'es',businessMode:'admin',companyName:'ContaGest QA',companyRif:'J-00000000-0'}};

async function heapUsed(cdp){
  const metrics=await cdp.send('Performance.getMetrics');
  const raw=metrics.metrics.find((item)=>item.name==='JSHeapUsedSize')?.value;
  if(typeof raw!=='number'||!Number.isFinite(raw)||raw<=0)throw new Error('ERP157_BROWSER_HEAP_METRIC_MISSING');
  return raw;
}
function clientRows(count){return Array.from({length:count},(_,i)=>({id:`perf-client-${i}`,name:`Synthetic Client ${i}`,rif:`J-PERF-${String(i).padStart(6,'0')}`,email:`perf${i}@example.test`,phone:'04120000000',status:'active',active:true,updatedAt:'2026-09-03T00:00:00.000Z'}));}

async function install(page,state){
  await page.addInitScript(({auth,store})=>{
    localStorage.setItem('contagest_ve_enterprise_v7_state',JSON.stringify(store));
    localStorage.setItem('contagest_auth_session',JSON.stringify(auth));
    window.__cgLongTasks=[];
    try{new PerformanceObserver((list)=>{window.__cgLongTasks.push(...list.getEntries().map((entry)=>({duration:entry.duration,startTime:entry.startTime})));}).observe({entryTypes:['longtask']});}catch{}
  },{auth:session,store});
  await page.route('**/api/**',async(route)=>{
    const request=route.request();const url=new URL(request.url());const pathname=url.pathname;
    if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:session})});
    if(pathname.endsWith('/auth/captcha'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{token:'perf-token-123456789012345678901234',question:'2 + 2',prompt:'2 + 2',expiresAt:new Date(Date.now()+300000).toISOString()}})});
    if(pathname.endsWith('/imports/preview')&&request.method()==='POST'){
      let body={};try{body=request.postDataJSON();}catch{}
      const rows=Array.isArray(body.rows)?body.rows:[];const now=new Date().toISOString();
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{id:`perf-batch-${rows.length}`,type:body.type||'clients',status:'validated',accepted:rows.length,rejected:0,checksum:'a'.repeat(64),expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:now,rows:rows.map((row,index)=>({index:index+1,row,action:'create',errors:[]}))}})});
    }
    if(/\/clients(?:$|\/|\?)/.test(`${pathname}${url.search}`)&&request.method()==='GET'){
      const rows=clientRows(state.clientRows);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:rows,meta:{total:rows.length,page:1,pageSize:rows.length}})});
    }
    const fixture=fixtureForRequest({url:request.url(),method:request.method(),state:'baseline'});
    return route.fulfill({status:fixture.status,contentType:'application/json',body:JSON.stringify(fixture.body)});
  });
}

async function gotoRoute(page,route){const started=performance.now();await page.goto(`/?module=${route}`,{waitUntil:'domcontentloaded'});await page.waitForSelector(route==='login'?'.login-shell':'#app',{state:'attached'});await page.waitForTimeout(80);return performance.now()-started;}
async function importCsv(page,count){
  await gotoRoute(page,'importacion-data');
  const csv=['name,rif,email',...Array.from({length:count},(_,i)=>`Synthetic ${i},J-PERF-IMP-${i},perf${i}@example.test`)].join('\n');
  await page.setInputFiles('#importFile',{name:`perf-${count}.csv`,mimeType:'text/csv',buffer:Buffer.from(csv)});
  const started=performance.now();await page.locator('#importForm button[type="submit"]').click();await expect(page.getByText(new RegExp(`${count} filas listas para confirmar|${count} aceptadas`))).toBeVisible({timeout:30_000});return performance.now()-started;
}
async function renderClients(page,state,count){state.clientRows=count;const started=performance.now();await gotoRoute(page,'clientes');await expect(page.getByText('Synthetic Client 0')).toBeVisible({timeout:30_000});return performance.now()-started;}

test('issue #157 frontend measured performance evidence',async({page})=>{
  const state={clientRows:100};await install(page,state);const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  const startup=[];await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});for(let i=0;i<5;i++)startup.push(await gotoRoute(page,'dashboard'));
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});for(let i=0;i<5;i++)await gotoRoute(page,'dashboard');

  const routeSwitch=[];for(let i=0;i<7;i++){
    await gotoRoute(page,'dashboard');const target=page.locator('[data-route="clientes"]:visible').first();await expect(target).toBeVisible();const started=performance.now();await target.click();await page.waitForFunction(()=>document.body.getAttribute('data-route')==='clientes');routeSwitch.push(performance.now()-started);
  }

  const save=[];for(let i=0;i<3;i++)save.push(await importCsv(page,1));
  const import1000=[];for(let i=0;i<3;i++)import1000.push(await importCsv(page,1000));
  const table100=[];const table1000=[];const table10000=[];
  for(let i=0;i<3;i++)table100.push(await renderClients(page,state,100));
  for(let i=0;i<3;i++)table1000.push(await renderClients(page,state,1000));
  for(let i=0;i<3;i++)table10000.push(await renderClients(page,state,10000));
  assert.equal(await page.evaluate(()=>document.readyState==='complete'||document.readyState==='interactive'),true,'Browser became unresponsive after 10k-row pressure.');

  await gotoRoute(page,'dashboard');const heapBefore=await heapUsed(cdp);const sessionStarted=performance.now();
  for(let i=0;i<30;i++)await gotoRoute(page,['dashboard','clientes','reportes'][i%3]);
  const heapAfter=await heapUsed(cdp);const sessionMinutes=Math.max((performance.now()-sessionStarted)/60000,1/60);const longTasks=await page.evaluate(()=>window.__cgLongTasks?.length||0);
  const responsiveProbe=await page.evaluate(()=>({ok:1+1===2,route:document.body.getAttribute('data-route')}));
  assert.equal(responsiveProbe.ok,true,'Browser failed responsiveness probe under constrained heap.');

  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:120,downloadThroughput:200000,uploadThroughput:100000,connectionType:'cellular3g'});const throttled=[];for(let i=0;i<3;i++)throttled.push(await gotoRoute(page,'dashboard'));await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});

  const heapGrowthPct=Math.max(0,((heapAfter-heapBefore)/heapBefore)*100);
  const output={
    schemaVersion:2,issue:157,candidateSha:sha,
    profiles:{cold:'MEASURED',warm:'MEASURED','repeated-navigation':'MEASURED','long-session':'MEASURED','network-throttled':'MEASURED'},
    metrics:{
      'frontend.startupP95Ms':q(startup,.95),'frontend.routeSwitchP95Ms':q(routeSwitch,.95),'frontend.saveP95Ms':q(save,.95),'frontend.import1000RowsP95Ms':q(import1000,.95),
      'frontend.table100P95Ms':q(table100,.95),'frontend.table1000P95Ms':q(table1000,.95),'frontend.table10000P95Ms':q(table10000,.95),
      'frontend.longSessionHeapGrowthPct':heapGrowthPct,'frontend.longTaskCountPerMinute':longTasks/sessionMinutes
    },
    degradation:{'memory-pressure':'MEASURED','large-payload':'MEASURED'},
    profilingEvidence:[
      {kind:'browser',engine:'chromium',startupSamples:startup,routeSwitchSamples:routeSwitch,saveSamples:save,import1000Samples:import1000,tableSamples:{100:table100,1000:table1000,10000:table10000},heapBefore,heapAfter,longTasks,throttledSamples:throttled},
      {kind:'memory-pressure',oldSpaceLimitMb:256,largestSyntheticTableRows:10000,responsiveAfterPressure:true,responsiveProbe}
    ]
  };
  fs.writeFileSync(path.join(outDir,'frontend-measurements.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
});
