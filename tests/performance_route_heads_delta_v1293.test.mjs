import assert from 'node:assert/strict';
import test from 'node:test';
import { compareRouteLabHeads } from '../scripts/compare-performance-route-heads-v1293.mjs';

const env={nodeVersion:'v22.16.0',osPlatform:'linux',osArch:'x64',cpuModel:'QA CPU',
  cpuLogicalCores:2,browserVersion:'140',networkProfile:'UNTHROTTLED_NOT_VERIFIED',
  viewportWidth:1440,viewportHeight:900,colorScheme:'light',reducedMotion:'reduce'};
const sha='a'.repeat(40), other='b'.repeat(40);
const keys=['routeReadyMs','lcpMs','cls','resourceCount','transferBytes','jsTransferBytes','cssTransferBytes','mockedApiRequests'];
function report(candidateSha,step=10){
  return {schemaVersion:1293,candidateSha,profile:'desktop-1440',campaignCount:5,
    runIds:['a','b','c','d','e'],labEnvironment:{...env},
    measurementType:'REPEATED_LAB_RENDER_ONLY',percentilesStatus:'LAB_ONLY_NOT_FIELD',
    productionWebVitalsStatus:'NOT_VERIFIED',authenticatedApiAndPostgresStatus:'NOT_EXECUTED',
    budgetsRatified:false,routes:Array.from({length:60},(_,i)=>({
      route:'route-'+i,family:'qa',risk:'high',metrics:Object.fromEntries(keys.map(k=>
        [k,k==='lcpMs'?{status:'INSUFFICIENT_OBSERVATIONS',samples:0,p75:null}:
        {status:'LAB_REPEATED_ONLY',samples:5,p50:step,p75:step+5,p95:step+10}]))
    }))};
}
test('#1293 before/after preserves observable lab p75 and unknown vitals',()=>{
 const v=compareRouteLabHeads({baseline:report(sha,20),candidate:report(other,10)});
 assert.equal(v.routeCount,60);
 assert.equal(v.routes[0].metrics.routeReadyMs.deltaP75,-10);
 assert.equal(v.routes[0].metrics.lcpMs.status,'NOT_COMPARABLE');
 assert.equal(v.budgetsRatified,false);
 assert.equal(v.realApiAndPostgresStatus,'NOT_EXECUTED');
 assert.equal(v.comparisonType,'REPEATED_SYNTHETIC_LAB_ONLY');
});
test('#1293 refuses same SHA, forged PASS and changing runner metadata',()=>{
 const baseline=report(sha),candidate=report(other);
 assert.throws(()=>compareRouteLabHeads({baseline,candidate:report(sha)}),/DIFFERENT_SHA_REQUIRED/);
 assert.throws(()=>compareRouteLabHeads({baseline,candidate:{...candidate,budgetsRatified:true}}),/REPORT_INVALID/);
 assert.throws(()=>compareRouteLabHeads({baseline,candidate:{...candidate,labEnvironment:{...env,cpuModel:'another CPU'}}}),/ENVIRONMENT_MISMATCH/);
 assert.throws(()=>compareRouteLabHeads({baseline,candidate:{...candidate,routes:candidate.routes.slice(1)}}),/REPORT_INVALID/);
});
test('#1293 fails closed for spoofed metrics and route drift',()=>{
 const baseline=report(sha),candidate=report(other);
 candidate.routes[0].metrics.routeReadyMs.p75=Infinity;
 assert.throws(()=>compareRouteLabHeads({baseline,candidate}),/METRIC_INVALID/);
 candidate.routes[0].metrics.routeReadyMs.p75=15;
 candidate.routes[0].metrics.fakeToken={status:'LAB_REPEATED_ONLY',p75:12};
 assert.throws(()=>compareRouteLabHeads({baseline,candidate}),/ROUTE_MISMATCH/);
 delete candidate.routes[0].metrics.fakeToken;
 candidate.routes[0].route='other';
 assert.throws(()=>compareRouteLabHeads({baseline,candidate}),/ROUTE_MISMATCH/);
});
