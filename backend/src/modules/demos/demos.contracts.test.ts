import test from 'node:test';
import assert from 'node:assert/strict';
import { demoSchema } from './demos.contracts.js';
import { SAFE_DEMO_MODULES } from '../licenses/licenses.contracts.js';

const base = {
  prospect:'Cliente de prueba',
  enabledModules:['gimnasio','veterinaria'],
  expiresAt:'2026-12-15',
  maxUsers:1,
  status:'active'
};

test('#1362 Gym/Vet commercial demo catalog comes from canonical nonprivileged routes',()=>{
  assert.equal(SAFE_DEMO_MODULES.has('gimnasio'),true);
  assert.equal(SAFE_DEMO_MODULES.has('veterinaria'),true);
  assert.equal(demoSchema.safeParse(base).success,true);
  for(const bad of ['admin','configuracion','backend','auditoria','no-existe']){
    assert.equal(demoSchema.safeParse({...base,enabledModules:['gimnasio',bad]}).success,false,bad);
  }
});

test('#1362 commercial records reject ambiguous dates, status, tenant injection and fractions',()=>{
  for(const expiresAt of ['2026-02-29','2026-04-31','2026-11-19T00:00:00Z','not-date']){
    assert.equal(demoSchema.safeParse({...base,expiresAt}).success,false,expiresAt);
  }
  assert.equal(demoSchema.safeParse({...base,status:'approved'}).success,false);
  assert.equal(demoSchema.safeParse({...base,tenantId:'foreign'}).success,false);
  assert.equal(demoSchema.safeParse({...base,maxUsers:1.5}).success,false);
});

test('#1362 idempotent module selection and valid custom day are preserved',()=>{
  const result=demoSchema.safeParse({...base,enabledModules:['veterinaria','veterinaria','gimnasio'],expiresAt:'2028-02-29'});
  assert.equal(result.success,true);
  if(result.success)assert.deepEqual(result.data.enabledModules,['veterinaria','gimnasio']);
});
