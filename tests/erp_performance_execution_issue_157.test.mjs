import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/erp-performance-capacity-v157.yml','utf8');
const backend=fs.readFileSync('qa/erp-performance-backend-v157.ts','utf8');
const calibration=fs.readFileSync('qa/erp-performance-calibration-v157.ts','utf8');
const frontend=fs.readFileSync('qa/erp-performance-frontend-v157.spec.mjs','utf8');
const assembler=fs.readFileSync('scripts/erp-performance-assemble-v157.mjs','utf8');
const gate=fs.readFileSync('scripts/erp-performance-gate-v157.mjs','utf8');
const finalizer=fs.readFileSync('scripts/erp-performance-finalize-v157.mjs','utf8');

test('#157 requires a declared expected peak instead of inventing concurrency',()=>{
  assert.match(workflow,/vars\.ERP157_EXPECTED_PEAK_USERS/);
  assert.match(backend,/ERP157_EXPECTED_PEAK_USERS/);
  assert.match(backend,/do not invent the business peak/);
  assert.doesNotMatch(workflow,/ERP157_EXPECTED_PEAK_USERS:\s*['"]?\d+/);
});

test('#157 calibration can measure a release candidate without inventing or certifying peak capacity',()=>{
  assert.match(workflow,/pull_request:/);
  assert.match(workflow,/calibration_only:/);
  assert.match(workflow,/calibration:/);
  assert.match(workflow,/erp-performance-calibration-v157\.ts/);
  assert.match(workflow,/github\.event_name != 'pull_request'/);
  assert.doesNotMatch(calibration,/process\.env\.ERP157_EXPECTED_PEAK_USERS/);
  assert.match(calibration,/truthState:\s*'MEASURED_PROVISIONAL'/);
  assert.match(calibration,/capacityCertified:\s*false/);
  assert.match(calibration,/expectedPeakConcurrentUsers:\s*null/);
  assert.match(calibration,/'1x': 'NOT_EXECUTED'/);
  assert.match(calibration,/\/exports\/xlsx/);
  assert.match(calibration,/crossTenantLeakCount/);
});

test('#157 DB metrics cannot silently report zero when Prisma telemetry is missing',()=>{
  for(const source of [calibration,backend]){
    assert.match(source,/assert\.ok\(querySamples\.length\s*>\s*0/);
    assert.match(source,/assert\.ok\(dbDurations\.length\s*>\s*0/);
    assert.match(source,/Prisma query telemetry produced no samples/);
    assert.match(source,/Prisma query telemetry produced no finite durations/);
  }
});

test('#157 can measure an exact frozen candidate without closing the issue by default',()=>{
  assert.match(workflow,/candidate_sha:/);
  assert.match(workflow,/finalize_issue:/);
  assert.match(workflow,/default: false/);
  assert.match(workflow,/CANDIDATE_SHA: \$\{\{ inputs\.candidate_sha \|\| github\.event\.pull_request\.head\.sha \|\| github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/);
  assert.match(workflow,/\^\[0-9a-fA-F\]\{40\}\$/);
  assert.match(workflow,/git rev-parse HEAD/);
  assert.match(workflow,/inputs\.finalize_issue == true/);
  assert.match(workflow,/measurementOnly/);
});

test('#157 measures real PostgreSQL/API plus 1x and 3x multi-profile load',()=>{
  assert.match(workflow,/postgres:16-alpine/);
  assert.match(workflow,/contagest_performance_v157_e2e/);
  assert.match(backend,/'finance-admin'/);assert.match(backend,/'operations-clerk'/);assert.match(backend,/'read-only-analyst'/);
  assert.match(backend,/for\(const factor of \[1,3\]\)/);
  assert.match(backend,/totalUsers=expectedPeak\*factor/);
  assert.match(backend,/pg_stat_activity/);assert.match(backend,/pg_stat_database/);
  assert.match(backend,/crossTenantLeakCount/);
});

test('#157 proves controlled pool saturation instead of labeling ordinary concurrency as saturation',()=>{
  assert.match(backend,/new Pool\(/);
  assert.match(backend,/max:2/);
  assert.match(backend,/connectionTimeoutMillis:180/);
  assert.match(backend,/timeoutObserved/);
  assert.match(backend,/Pool did not recover/);
});

test('#157 measures browser startup/navigation/import/large tables/memory/network',()=>{
  assert.match(frontend,/importCsv\(page,1000\)/);
  assert.match(frontend,/renderClients\(page,state,10000\)/);
  assert.match(frontend,/JSHeapUsedSize/);
  assert.match(frontend,/Network\.emulateNetworkConditions/);
  assert.match(frontend,/longTaskCountPerMinute/);
  assert.match(frontend,/max-old-space-size=256/);
  assert.match(frontend,/responsiveAfterPressure:true/);
});

test('#157 executes heavy success/error contracts and controlled degradation',()=>{
  assert.match(backend,/heavyProcesses\.import\.success=true/);
  assert.match(backend,/heavyProcesses\.export\.success=true/);
  assert.match(backend,/heavyProcesses\.report\.success=true/);
  assert.match(backend,/HEAVY_PROCESS_CONTRACT_INCOMPLETE/);
  assert.match(backend,/external-timeout/);
  assert.match(backend,/slow-db/);
  assert.match(backend,/multi-user-concurrency/);
});

test('#157 gate cannot pass missing metrics and the workflow cannot fake green',()=>{
  assert.match(gate,/checks\.some\(\(c\)=>c\.value===null\)/);
  assert.match(assembler,/sanitizedFixtures:true/);
  assert.doesNotMatch(workflow,/continue-on-error:\s*true/);
  assert.doesNotMatch(workflow,/npm.*\|\|\s*true/);
});

test('#157 closes only after measured capacity gate passes and #155 is already closed',()=>{
  const capacityIndex=workflow.indexOf('\n  capacity:');
  const gateIndex=workflow.indexOf('erp-performance-gate-v157.mjs check');
  const finalizerIndex=workflow.indexOf('erp-performance-finalize-v157.mjs');
  assert.ok(capacityIndex>=0&&gateIndex>capacityIndex&&finalizerIndex>gateIndex);
  assert.match(finalizer,/issues\/155/);
  assert.match(finalizer,/dependency\.state!==['"]closed['"]/);
  assert.match(finalizer,/PERFORMANCE_VERDICT_NOT_CLOSABLE/);
  assert.match(finalizer,/measurementHash/);
  assert.match(finalizer,/state:'closed',state_reason:'completed'/);
});
