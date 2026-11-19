import test from 'node:test';
import assert from 'node:assert/strict';
import { licenseSchema, PRIVILEGED_DEMO_ROUTES } from './licenses.contracts.js';

const payload = {
  userEmail:'test-person@example.invalid',
  fullName:'Usuario de prueba',
  plan:'trial' as const,
  commercialUse:'demostracion' as const,
  businessSector:'gimnasio' as const,
  modules:['gimnasio'],
  days:14,
  maxUsers:1,
  maxDevices:1
};

test('#1362: demo/trial license rejects administrative modules even when mixed with Gym',()=>{
  assert.ok(PRIVILEGED_DEMO_ROUTES.has('admin'));
  for(const route of ['admin','configuracion','backend']){
    const rejected=licenseSchema.safeParse({...payload,modules:['gimnasio',route]});
    assert.equal(rejected.success,false,route);
    if(!rejected.success)assert.ok(rejected.error.issues.some(issue=>issue.path[0]==='modules'));
  }
});

test('#1362: authorized vertical-only demo and trial scope remain admissible',()=>{
  assert.equal(licenseSchema.safeParse(payload).success,true);
  assert.equal(licenseSchema.safeParse({...payload,modules:['veterinaria'],businessSector:'veterinaria'}).success,true);
  assert.equal(licenseSchema.safeParse({...payload,commercialUse:'evaluacion'}).success,true);
});

test('#1362: existing non-demo administrative license contract is not silently removed',()=>{
  assert.equal(licenseSchema.safeParse({
    ...payload,plan:'enterprise',commercialUse:'operacion',modules:['admin']
  }).success,true);
  assert.equal(licenseSchema.safeParse({
    ...payload,plan:'enterprise',commercialUse:'demostracion',modules:['admin']
  }).success,false);
});
