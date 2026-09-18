import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const manifestRaw=read('docs/baselines/contagest-technical-baseline-v1.json');
const manifest=JSON.parse(manifestRaw);
const gitBlobSha=(content)=>{
  const body=Buffer.from(content,'utf8');
  return crypto.createHash('sha1').update(Buffer.from(`blob ${body.length}\0`,'utf8')).update(body).digest('hex');
};

test('technical baseline v1 is byte-for-byte immutable and pins both SHA meanings',()=>{
  assert.equal(gitBlobSha(manifestRaw),'4930d62497f30d350adbd2dc5312ee882189b007');
  assert.equal(manifest.roadmapItem,'1/51');
  assert.equal(manifest.requestedAuditSha,'ab02c550f24c3347121d8c74c636b450245036ac');
  assert.equal(manifest.baselineSourceSha,'9566d77ad51e6eccc51d95fa76c65487a1b08821');
  assert.equal(manifest.validationContract.requiredBaselineSha,manifest.baselineSourceSha);
});

test('technical baseline v1 freezes the 58-route catalog without forbidding later route evolution',()=>{
  assert.equal(manifest.routeCatalog.expectedCount,58);
  assert.equal(manifest.routeCatalog.routes.length,58);
  assert.equal(new Set(manifest.routeCatalog.routes).size,58);
  for(const route of ['odontologia','veterinaria','gimnasio','rutinas','nutricion'])assert.ok(manifest.routeCatalog.routes.includes(route));
});

test('technical baseline v1 inventories the requested vertical schemas and DB ownership',()=>{
  assert.deepEqual(manifest.verticalFrontends.dentistry.routes,['odontologia']);
  assert.deepEqual(manifest.verticalFrontends.veterinary.routes,['veterinaria']);
  assert.deepEqual(manifest.verticalFrontends.gym.routes,['gimnasio','rutinas','nutricion']);
  const tables=new Set(manifest.database.migrations.flatMap((item)=>item.tables));
  for(const required of ['CarePatient','CareEncounter','CareLabOrder','CareHospitalization','GymMember','GymRoutine','GymNutritionPlan','GymMeal']){
    assert.ok(tables.has(required),`missing baseline table ${required}`);
  }
});

test('technical baseline v1 freezes 61 endpoints as historical snapshot data',()=>{
  const inventories=Object.entries(manifest.endpoints.bySource);
  assert.equal(inventories.length,6);
  assert.equal(inventories.reduce((sum,[,routes])=>sum+routes.length,0),61);
  assert.deepEqual(manifest.endpoints.mountPoints,{
    healthGymCommunications:'/api/v1/verticals',
    veterinary:'/api/v1/verticals/veterinary',
    veterinaryCrud:'/api/v1/verticals'
  });
});

test('baseline source references are pinned by full Git blob SHAs',()=>{
  const blobRefs=[];
  const visit=(value)=>{
    if(Array.isArray(value)){for(const item of value)visit(item);return;}
    if(!value||typeof value!=='object')return;
    if(Object.hasOwn(value,'blobSha'))blobRefs.push(value.blobSha);
    for(const child of Object.values(value))visit(child);
  };
  visit(manifest);
  assert.ok(blobRefs.length>0);
  for(const sha of blobRefs)assert.match(sha,/^[0-9a-f]{40}$/i);
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
    if(Object.hasOwn(item,'steps'))assert.equal(item.steps,null);
    if(Object.hasOwn(item,'allObservedJobsSteps'))assert.equal(item.allObservedJobsSteps,null);
    assert.notEqual(item.conclusion,'success');
  }
});
