import test from 'node:test';
import assert from 'node:assert/strict';
import { clinicalDemoRouteAllowed as allowed } from './clinicalDemoRoutePolicy.js';

test('#1362 veterinary-only demo grants health.manage only to Vet endpoints',()=>{
  const vet=['veterinaria'];
  assert.equal(allowed('health.manage',vet,'/api/v1/verticals/veterinary/patients'),true);
  assert.equal(allowed('health.manage',vet,'/api/v1/verticals/veterinary/guardian-portal/grants?patientId=abc'),true);
  for(const wrong of [
    '/api/v1/verticals/health/patients',
    '/api/v1/verticals/health/encounters',
    '/api/v1/verticals/health/dental/chart-history',
    '/api/v1/verticals/veterinary2/patients',
    '/api/v1/verticals/veterinary-exports',
    '/api/v1/health/patients',
  ])assert.equal(allowed('health.manage',vet,wrong),false,wrong);
});

test('#1362 Care and Dental demos cannot borrow a veterinary route',()=>{
  for(const clinical of [['salud'],['odontologia']]){
    assert.equal(allowed('health.manage',clinical,'/api/v1/verticals/health/patients'),true);
    assert.equal(allowed('health.manage',clinical,'/api/v1/verticals/veterinary/patients'),false);
  }
  assert.equal(allowed('health.manage',['veterinaria','salud'],
    '/api/v1/verticals/health/patients'),true);
});

test('#1362 nonclinical permission is unchanged and unknown clinical endpoints fail closed',()=>{
  assert.equal(allowed('gym.manage',['gimnasio'],'/api/v1/verticals/gym/members'),true);
  assert.equal(allowed('health.manage',['veterinaria'],'/api/v1/other/clinical'),false);
  assert.equal(allowed('health.manage',[],'/api/v1/verticals/veterinary/patients'),false);
});
