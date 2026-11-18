import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

test('#799 equipment lifecycle: location owner, duplicate key, maintenance and event replay',async(t)=>{
  assert.notEqual(process.env.NODE_ENV,'production');
  const h=await createRealBackendHarness();
  const tag=randomUUID().slice(0,8);
  let locationId='',equipmentId='',orderId='';
  t.after(async()=>{
    try {
      if(orderId){
        await h.prisma.$executeRawUnsafe('DELETE FROM public."GymEquipmentWorkOrderEvent" WHERE "tenantId"=$1 AND "workOrderId"=$2',h.tenant.id,orderId);
        await h.prisma.$executeRawUnsafe('DELETE FROM public."GymEquipmentWorkOrder" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,orderId);
      }
      if(equipmentId)await h.prisma.$executeRawUnsafe('DELETE FROM public."GymEquipment" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,equipmentId);
      if(locationId)await h.prisma.$executeRawUnsafe('DELETE FROM public."BusinessLocation" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,locationId);
    } finally {await h.close();}
  });
  const location=await h.ok('/business-locations',{method:'POST',body:JSON.stringify({
    code:'GYM'+tag,name:'QA equipment location',timezone:'America/Caracas'
  })});
  locationId=location.id;
  await h.status('/verticals/gym/equipment',404,{method:'POST',body:JSON.stringify({
    locationId:randomUUID(),code:'GYM'+tag,name:'Equipo test'
  })});
  const equip=await h.ok('/verticals/gym/equipment',{method:'POST',body:JSON.stringify({
    locationId,code:'GYM'+tag,name:'Equipo test'
  })});
  equipmentId=equip.id;
  await h.status('/verticals/gym/equipment',409,{method:'POST',body:JSON.stringify({
    locationId,code:'GYM'+tag,name:'Código repetido'
  })});
  const requestKey=randomUUID();
  const create=(title:string)=>h.request('/verticals/gym/equipment/'+equipmentId+'/work-orders',{
    method:'POST',body:JSON.stringify({kind:'incident',title,requestKey})
  });
  const pair=await Promise.all([create('Freno roto'),create('Freno roto')]);
  assert.deepEqual(pair.map(x=>x.response.status).sort(),[200,201]);
  assert.equal(pair[0].data.id,pair[1].data.id);
  orderId=pair[0].data.id;
  assert.equal((await create('Motor roto')).response.status,409);
  const before=await h.ok('/verticals/gym/equipment');
  assert.equal(before.find((item:any)=>item.id===equipmentId)?.availability,'maintenance');
  const eventKey=randomUUID();
  const start=()=>h.request('/verticals/gym/equipment/work-orders/'+orderId+'/transitions',{
    method:'POST',body:JSON.stringify({toStatus:'in_progress',eventKey})
  });
  const started=await Promise.all([start(),start()]);
  assert.deepEqual(started.map(x=>x.response.status).sort(),[200,201]);
  assert.equal(started[0].data.id,started[1].data.id);
  const closed=await h.request('/verticals/gym/equipment/work-orders/'+orderId+'/transitions',{
    method:'POST',body:JSON.stringify({toStatus:'resolved',reason:'Reparado',eventKey:randomUUID()})
  });
  assert.equal(closed.response.status,201);
  const events=await h.ok('/verticals/gym/equipment/'+equipmentId+'/work-orders');
  assert.deepEqual(events[0].events.map((x:any)=>x.toStatus),['open','in_progress','resolved']);
  const after=await h.ok('/verticals/gym/equipment?locationId='+locationId);
  assert.equal(after[0].availability,'available');
});
