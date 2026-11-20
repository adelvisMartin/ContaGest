#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { labEnvironmentFingerprint } from './performance-route-campaign-v1293.mjs';

const SHA=/^[a-f0-9]{40}$/;
const METRICS=['routeReadyMs','lcpMs','cls','resourceCount','transferBytes',
  'jsTransferBytes','cssTransferBytes','mockedApiRequests'];
const KEYSET=[...METRICS].sort().join('|');
const ROOT='artifacts/performance/v1293';
const fail=(code)=>{throw new Error('PERF1293_DELTA_'+code);};
const valid=(n)=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const sameKeys=(v)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===KEYSET;

/** Only compare synthetic lab observations from the SAME runner profile.
 * No field vitals, authenticated API p95, PostgreSQL or production budget PASS.
 */
export function compareRouteLabHeads({baseline,candidate}){
  for(const report of [baseline,candidate]){
    if(!report||report.schemaVersion!==1293||!SHA.test(report.candidateSha||'')||
      report.profile!=='desktop-1440'||report.measurementType!=='REPEATED_LAB_RENDER_ONLY'||
      report.percentilesStatus!=='LAB_ONLY_NOT_FIELD'||report.productionWebVitalsStatus!=='NOT_VERIFIED'||
      report.authenticatedApiAndPostgresStatus!=='NOT_EXECUTED'||report.budgetsRatified!==false||
      !Number.isSafeInteger(report.campaignCount)||report.campaignCount<5||report.campaignCount>30||
      !Array.isArray(report.runIds)||report.runIds.length!==report.campaignCount||
      new Set(report.runIds).size!==report.runIds.length||
      !Array.isArray(report.routes)||report.routes.length!==60)fail('REPORT_INVALID');
  }
  if(baseline.candidateSha===candidate.candidateSha)fail('DIFFERENT_SHA_REQUIRED');
  if(labEnvironmentFingerprint(baseline.labEnvironment)!==
     labEnvironmentFingerprint(candidate.labEnvironment))fail('ENVIRONMENT_MISMATCH');
  const routes=[];
  for(let i=0;i<60;i++){
    const before=baseline.routes[i],after=candidate.routes[i];
    if(!before||!after||before.route!==after.route||before.family!==after.family||
      before.risk!==after.risk||!sameKeys(before.metrics)||!sameKeys(after.metrics)||
      !/^[a-z][a-z0-9-]{0,63}$/.test(before.route))fail('ROUTE_MISMATCH');
    const metrics={};
    for(const key of METRICS){
      const b=before.metrics[key],c=after.metrics[key];
      for(const item of [b,c]){
        if(!item||!['LAB_REPEATED_ONLY','INSUFFICIENT_OBSERVATIONS'].includes(item.status)||
          !Number.isSafeInteger(item.samples)||item.samples<0||item.samples>30||
          (item.status==='LAB_REPEATED_ONLY'&&
             (item.samples<5||![item.p50,item.p75,item.p95].every(valid)||
              item.p50>item.p75||item.p75>item.p95))||
          (item.status==='INSUFFICIENT_OBSERVATIONS'&&item.p75!==null))fail('METRIC_INVALID');
      }
      const complete=b.status==='LAB_REPEATED_ONLY'&&c.status==='LAB_REPEATED_ONLY';
      metrics[key]=complete?{
        status:'LAB_OBSERVATION_ONLY',baselineP75:b.p75,candidateP75:c.p75,
        deltaP75:c.p75-b.p75
      }:{status:'NOT_COMPARABLE',baselineP75:null,candidateP75:null,deltaP75:null};
    }
    routes.push({route:before.route,family:before.family,risk:before.risk,metrics});
  }
  return {schemaVersion:1293,baselineSha:baseline.candidateSha,candidateSha:candidate.candidateSha,
    baselineCampaigns:baseline.campaignCount,candidateCampaigns:candidate.campaignCount,
    comparisonType:'REPEATED_SYNTHETIC_LAB_ONLY',webVitalsStatus:'NOT_VERIFIED',
    realApiAndPostgresStatus:'NOT_EXECUTED',budgetsRatified:false,
    routeCount:60,routes};
}

function readReport(sha){
  if(!SHA.test(sha))fail('SHA_INVALID');
  const file=path.join(ROOT,sha,'lab-campaign-comparison.json');
  if(!existsSync(file))fail('REPORT_MISSING');
  const raw=readFileSync(file,'utf8');
  if(Buffer.byteLength(raw)>1_500_000)fail('REPORT_TOO_LARGE');
  const report=JSON.parse(raw);
  if(report.candidateSha!==sha)fail('REPORT_SHA_MISMATCH');
  return report;
}

function main(){
  if(process.argv.length!==2)fail('ARGUMENTS_INVALID');
  const candidateSha=String(process.env.CANDIDATE_SHA||'').trim().toLowerCase();
  const baselineSha=String(process.env.CG_PERF1293_BASELINE_SHA||'').trim().toLowerCase();
  if(!SHA.test(candidateSha)||!SHA.test(baselineSha))fail('SHA_INVALID');
  const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim().toLowerCase();
  if(head!==candidateSha)fail('HEAD_MISMATCH');
  const result=compareRouteLabHeads({baseline:readReport(baselineSha),candidate:readReport(candidateSha)});
  const target=path.join(ROOT,candidateSha,'lab-before-after.json');
  mkdirSync(path.dirname(target),{recursive:true});
  writeFileSync(target,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({ticket:1293,status:result.comparisonType,candidateSha,
    baselineSha,routeCount:result.routeCount,output:target}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{main();}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
