import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {veterinaryMicrochipTaken} from '../backend/src/modules/verticals/veterinary-microchip-ownership.mjs';

test('#810 normalize microchip by PostgreSQL lower/btrim in the same advisory key and uniqueness predicate',async()=>{
  const calls=[];
  const tx={$queryRawUnsafe:async(sql,...args)=>{
    calls.push({sql,args});
    return calls.length===1?[{locked:null}]:[{id:'existing-animal'}];
  }};
  assert.equal(await veterinaryMicrochipTaken(tx,'tenantA',' Ab-C123 ','current-patient'),true);
  assert.equal(calls.length,2);
  assert.match(calls[0].sql,/pg_advisory_xact_lock\(/);
  assert.match(calls[0].sql,/hashtextextended\('vet:microchip:'\|\|\$1\|\|':'\|\|lower\(btrim\(\$2\)\),0\)/);
  assert.match(calls[1].sql,/lower\(btrim\("microchip"\)\)=lower\(btrim\(\$2\)\)/);
  assert.match(calls[1].sql,/"tenantId"=\$1 AND "kind"='animal'/);
  assert.match(calls[1].sql,/\(\$3::text IS NULL OR "id"<>\$3\)/);
  assert.deepEqual(calls[0].args,['tenantA','Ab-C123']);
  assert.deepEqual(calls[1].args,['tenantA','Ab-C123','current-patient']);
});

test('#810 empty microchips do not claim occupancy and all tenantless writes fail closed',async()=>{
  let queries=0;
  const tx={$queryRawUnsafe:async()=>{queries++;return[];}};
  for(const value of ['',null,undefined,'   '])
    assert.equal(await veterinaryMicrochipTaken(tx,'tenantA',value),false);
  assert.equal(queries,0);
  await assert.rejects(()=>veterinaryMicrochipTaken(tx,'','ABC'),
    {message:'VET_MICROCHIP_TENANT_REQUIRED'});
});

test('#810 creation and edits both use locked tenant uniqueness checks before writing',()=>{
  const create=readFileSync(new URL('../backend/src/modules/verticals/health-core.routes.ts',import.meta.url),'utf8')
    .split("router.post('/health/patients'")[1].split("router.get('/health/professionals'")[0];
  const edit=readFileSync(new URL('../backend/src/modules/verticals/veterinary-crud-patients.routes.ts',import.meta.url),'utf8')
    .split("router.patch('/health/patients/:id'")[1].split("router.delete('/health/patients/:id'")[0];
  for(const [name,route] of [['create',create],['edit',edit]]){
    assert.match(route,/prisma\.\$transaction\(async\(tx\)=>/);
    const ownership=route.indexOf('veterinaryMicrochipTaken(');
    const mutation=route.indexOf(name==='create'?'INSERT INTO public."CarePatient"':'UPDATE public."CarePatient"');
    assert.ok(ownership>0&&mutation>ownership,name+' must check ownership before mutation');
    assert.match(route,/throw new HttpError\(409/);
    assert.match(route,/tx\.\$queryRawUnsafe/);
  }
  assert.match(create,/b\.kind==='animal'/);
  assert.match(edit,/changed\(b,'microchip'\)/);
  assert.match(edit,/veterinaryMicrochipTaken\(tx,ctx\(req\)\.tenantId,b\.microchip,req\.params\.id\)/);
});
