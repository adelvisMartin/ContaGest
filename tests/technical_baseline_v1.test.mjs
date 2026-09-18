import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root=process.cwd();
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const manifest=JSON.parse(read('docs/baselines/contagest-technical-baseline-v1.json'));

test('technical baseline v1 pins the requested audit SHA and the real implementation-start SHA',()=>{
  assert.equal(manifest.roadmapItem,'1/51');
  assert.equal(manifest.requestedAuditSha,'ab02c550f24c3347121d8c74c636b450245036ac');
  assert.equal(manifest.baselineSourceSha,'9566d77ad51e6eccc51d95fa76c65487a1b08821');
  assert.equal(manifest.validationContract.requiredBaselineSha,manifest.baselineSourceSha);
});

test('technical baseline v1 freezes the canonical 58-route registry',async()=>{
  const registryPath=path.join(root,'frontend','src','data','pageRegistry.js');
  const {PAGE_ROUTES}=await import(`${pathToFileURL(registryPath).href}?test=${Date.now()}`);
  assert.equal(PAGE_ROUTES.length,58);
  assert.deepEqual(PAGE_ROUTES,manifest.routeCatalog.routes);
});

test('technical baseline v1 inventories the three requested vertical surfaces and DB ownership',()=>{
  assert.deepEqual(manifest.verticalFrontends.dentistry.routes,['odontologia']);
  assert.deepEqual(manifest.verticalFrontends.veterinary.routes,['veterinaria']);
  assert.deepEqual(manifest.verticalFrontends.gym.routes,['gimnasio','rutinas','nutricion']);
  const tables=new Set(manifest.database.migrations.flatMap((item)=>item.tables));
  for(const required of ['CarePatient','CareEncounter','CareLabOrder','CareHospitalization','GymMember','GymRoutine','GymNutritionPlan','GymMeal']){
    assert.ok(tables.has(required),`missing baseline table ${required}`);
  }
});

test('technical baseline v1 preserves exact endpoint inventories by source',()=>{
  const routesOf=(relative)=>[...read(relative).matchAll(/\brouter\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)]
    .map((match)=>`${match[1].toUpperCase()} ${match[2]}`);
  for(const [relative,expected] of Object.entries(manifest.endpoints.bySource)){
    assert.deepEqual(routesOf(relative),expected,relative);
  }
});

test('baseline gate is wired into package and CI before architecture audit',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['baseline:verify'],'node scripts/verify-technical-baseline-v1.mjs');
  const ci=read('.github/workflows/ci.yml');
  const baseline=ci.indexOf('npm run baseline:verify');
  const architecture=ci.indexOf('npm run audit:architecture');
  assert.ok(baseline>=0&&architecture>baseline);
});

test('CI snapshot does not misclassify pre-step infrastructure failures as PASS',()=>{
  assert.equal(manifest.ci.latestArchitectureCandidate.classification,'BLOCKED_INFRASTRUCTURE_PRE_STEPS');
  for(const item of manifest.ci.latestArchitectureCandidate.evidence){
    if(Object.hasOwn(item,'steps')) assert.equal(item.steps,null);
    if(Object.hasOwn(item,'allObservedJobsSteps')) assert.equal(item.allObservedJobsSteps,null);
    assert.notEqual(item.conclusion,'success');
  }
});
