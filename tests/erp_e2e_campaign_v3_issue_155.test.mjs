import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  buildErpE2EMatrixV155,
  caseIdentityV155,
  ERP_E2E_ROLES_V155,
  ERP_E2E_ROUTES_V155,
  ERP_E2E_STATES_V155,
  ERP_E2E_VIEWPORTS_V155,
  validateEvidenceMatrixV155
} from '../qa/support/erp-e2e-matrix-v155.mjs';
import { fixtureForRequest, fixtureMetadata } from '../qa/support/erp-system-fixtures-v155.mjs';

const EXPECTED_VIEWPORTS=[
  ['phone-360',360,800,'portrait'],['phone-390',390,844,'portrait'],['phone-430',430,932,'portrait'],['tablet-768',768,1024,'portrait'],['desktop-1366',1366,768,'landscape'],['desktop-1920',1920,1080,'landscape'],['phone-360-landscape',800,360,'landscape'],['phone-390-landscape',844,390,'landscape'],['phone-430-landscape',932,430,'landscape']
];

test('canonical campaign contains 58 unique routes and the exact requested geometries',()=>{
  assert.equal(ERP_E2E_ROUTES_V155.length,58);assert.equal(new Set(ERP_E2E_ROUTES_V155.map((item)=>item.route)).size,58);
  assert.deepEqual(ERP_E2E_VIEWPORTS_V155.map((item)=>[item.name,item.width,item.height,item.orientation]),EXPECTED_VIEWPORTS);
  assert.deepEqual(ERP_E2E_ROLES_V155,['admin','operator','read-only']);
  assert.deepEqual(ERP_E2E_STATES_V155,['baseline','loading','empty','error','offline','stale','role-denied','boundary']);
});

test('every route owns at least one explicit critical flow and every canonical identity is unique',()=>{
  for(const route of ERP_E2E_ROUTES_V155){assert.ok(Array.isArray(route.criticalFlows)&&route.criticalFlows.length>0,route.route);assert.equal(new Set(route.criticalFlows).size,route.criticalFlows.length,`${route.route} duplicate critical flow`);}
  const matrix=buildErpE2EMatrixV155();const ids=matrix.map(caseIdentityV155);assert.equal(new Set(ids).size,matrix.length);
  const expected=ERP_E2E_ROUTES_V155.reduce((sum,route)=>sum+(route.criticalFlows.length*ERP_E2E_STATES_V155.length*ERP_E2E_ROLES_V155.length*ERP_E2E_VIEWPORTS_V155.length),0);assert.equal(matrix.length,expected);assert.ok(matrix.length>58*8*3*9,'critical-flow must increase coverage beyond a four-dimensional matrix');
});

test('canonical matrix validates but deliberate missing, duplicate, geometry and flow regressions fail',()=>{
  const matrix=buildErpE2EMatrixV155();assert.equal(validateEvidenceMatrixV155(matrix).valid,true);
  const missingResult=validateEvidenceMatrixV155(matrix.slice(1));assert.equal(missingResult.valid,false);assert.ok(missingResult.errors.some((item)=>item.startsWith('MISSING_CASE:')));
  const duplicateResult=validateEvidenceMatrixV155([...matrix,matrix[0]]);assert.equal(duplicateResult.valid,false);assert.ok(duplicateResult.errors.some((item)=>item.startsWith('DUPLICATE_CASE:')));
  const geometryResult=validateEvidenceMatrixV155(matrix.map((item,index)=>index===0?{...item,width:item.width+1}:item));assert.equal(geometryResult.valid,false);assert.ok(geometryResult.errors.some((item)=>item.startsWith('VIEWPORT_GEOMETRY_MISMATCH:')));
  const flowResult=validateEvidenceMatrixV155(matrix.map((item,index)=>index===0?{...item,criticalFlow:'invented-flow-not-in-contract'}:item));assert.equal(flowResult.valid,false);assert.ok(flowResult.errors.some((item)=>item.startsWith('UNKNOWN_CASE:')));
});

test('fixtures are synthetic and model denied error loading stale and boundary independently',()=>{
  assert.deepEqual(fixtureMetadata(),{classification:'SYNTHETIC_TEST_ONLY',containsRealPII:false,generatedForIssue:155});
  const normal=fixtureForRequest({url:'http://qa.local/api/v1/clients',state:'baseline'});assert.equal(normal.status,200);assert.match(JSON.stringify(normal.body),/@example\.test/);
  assert.equal(fixtureForRequest({url:'http://qa.local/api/v1/clients',state:'role-denied'}).status,403);
  assert.equal(fixtureForRequest({url:'http://qa.local/api/v1/clients',state:'error'}).status,500);
  assert.ok(fixtureForRequest({url:'http://qa.local/api/v1/clients',state:'loading'}).delayMs>=500);
  const stale=fixtureForRequest({url:'http://qa.local/api/v1/clients',state:'stale'});assert.equal(stale.body.meta.stale,true);assert.match(JSON.stringify(stale.body),/2025-01-01/);
  assert.match(JSON.stringify(fixtureForRequest({url:'http://qa.local/api/v1/sales',state:'boundary'}).body),/QA-LARGO/);
});

test('evidence recorder v3 cannot collapse critical-flow or turn PII into valid evidence',()=>{
  const source=fs.readFileSync(new URL('../scripts/erp-e2e-evidence-v155.mjs',import.meta.url),'utf8');assert.match(source,/schemaVersion:3/);assert.match(source,/dimensions:\['route','role','state','viewport','criticalFlow'\]/);assert.match(source,/caseIdentityV155/);assert.match(source,/validateEvidenceMatrixV155/);assert.match(source,/EVIDENCE_REAL_PII_NOT_ALLOWED/);assert.match(source,/criticalFlow,status/);
});

test('browser campaign writes synthetic evidence and the aggregator fails closed on missing shards',()=>{
  const browser=fs.readFileSync(new URL('../qa/erp-system-campaign-v155.spec.mjs',import.meta.url),'utf8');const aggregate=fs.readFileSync(new URL('../scripts/erp-system-qa-aggregate-v155.mjs',import.meta.url),'utf8');assert.match(browser,/SYNTHETIC_TEST_ONLY/);assert.match(browser,/QA_ROLE/);assert.match(browser,/QA_VIEWPORT/);assert.match(browser,/CANDIDATE_SHA_REQUIRED_40_HEX/);assert.match(browser,/offline/);assert.match(browser,/role-denied/);assert.match(browser,/auditZoom200/);assert.match(browser,/zoom-200/);assert.match(browser,/auditThemeModes/);assert.match(browser,/INTERACTIVE_OCCLUDED/);assert.match(browser,/DIALOG_OUTSIDE_VIEWPORT/);assert.match(browser,/AccessControlService/);assert.match(aggregate,/SHARD_RESULT_MISSING/);assert.match(aggregate,/NOT_EXECUTED/);assert.match(aggregate,/defect-candidates\.json/);assert.match(aggregate,/knownIssue:item\.route==='login'\?'#221':null/);
});

test('full campaign can run on a frozen release candidate and includes CAPTCHA source plus browser regressions',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/erp-system-qa-campaign-v155.yml',import.meta.url),'utf8');
  const captchaBrowser=fs.readFileSync(new URL('../qa/login-captcha-v221.spec.mjs',import.meta.url),'utf8');
  assert.match(workflow,/startsWith\(github\.head_ref, 'release\/candidate-'\)/);
  assert.match(workflow,/Auth\/CAPTCHA bootstrap regression/);
  assert.match(workflow,/auth\.captcha-bootstrap\.test\.ts/);
  assert.match(workflow,/CAPTCHA browser recovery and responsive regression #221/);
  assert.match(workflow,/qa\/login-captcha-v221\.spec\.mjs/);
  assert.match(workflow,/CAPTCHA_BROWSER='\$\{\{ steps\.captcha_browser\.outcome \}\}'/);
  assert.match(workflow,/\"captchaBrowser\":\"%s\"/);
  assert.match(workflow,/AUTH='\$\{\{ steps\.auth\.outcome \}\}'/);
  assert.match(workflow,/\"auth\":\"%s\"/);
  assert.match(captchaBrowser,/delayed CAPTCHA keeps answer and submit disabled/);
  assert.match(captchaBrowser,/manual refresh recovers without page reload/);
  assert.match(captchaBrowser,/submit is blocked when the signed CAPTCHA token is missing/);
  for(const size of ['360,640','390,844','430,932','768,1024','1366,768'])assert.match(captchaBrowser,new RegExp(`\\[${size.replace(',','\\s*,\\s*')}\\]`));
  assert.match(captchaBrowser,/\[1\.25,1\.5,2\]/);
  assert.match(captchaBrowser,/orientation resize/);
});

test('every real P0/P1 finding must be linked to an existing issue or atomically harvested',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/erp-system-qa-campaign-v155.yml',import.meta.url),'utf8');
  const harvester=fs.readFileSync(new URL('../scripts/erp-system-qa-harvest-v155.mjs',import.meta.url),'utf8');
  assert.match(workflow,/issues:\s*write/);
  assert.match(workflow,/erp-system-qa-harvest-v155\.mjs/);
  assert.match(workflow,/steps\.harvest\.outcome/);
  assert.match(harvester,/\['P0','P1'\]/);
  assert.match(harvester,/linked-existing/);
  assert.match(harvester,/deduplicated-existing/);
  assert.match(harvester,/runGh\(\['issue','create'/);
  assert.match(harvester,/SYNTHETIC_TEST_ONLY/);
  assert.match(harvester,/QA155-FINGERPRINT/);
});
