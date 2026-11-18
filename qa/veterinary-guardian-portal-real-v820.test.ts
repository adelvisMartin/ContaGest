import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRealBackendHarness} from './support/real-backend-harness.ts';

test('#820 real PG: guardian token scopes, expiry and revocation bind one patient',async t=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  assert.ok(!process.env.VERCEL&&!process.env.VERCEL_ENV,'No shared or provider production DB');
  const h=await createRealBackendHarness();
  let patientId='';
  const grants:string[]=[];
  t.after(async()=>{
    try {
      for(const id of grants)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."VeterinaryGuardianPortalGrant" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,id);
      if(patientId)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,patientId);
    }finally{await h.close();}
  });
  const pet=await h.ok('/verticals/health/patients',{method:'POST',body:JSON.stringify({
    kind:'animal',displayName:'QA portal '+randomUUID(),species:'canine',
    guardianName:'QA guardian',active:true,emergencyContact:{}
  })});
  patientId=pet.id;
  const grant=async()=>h.ok('/verticals/veterinary/guardian-portal/grants',{
    method:'POST',body:JSON.stringify({patientId,expiresInHours:1,
      scopes:['appointments','discharge']})
  });
  const first=await grant();
  grants.push(first.id);
  assert.ok(typeof first.portalToken==='string'&&first.portalToken.length>30);
  const portal=(token:string)=>h.request('/public/veterinary-portal/session',{
    method:'POST',body:JSON.stringify({accessToken:token})
  },'');
  const read=await portal(first.portalToken);
  assert.equal(read.response.status,200,JSON.stringify(read.payload));
  assert.equal(read.response.headers.get('cache-control')?.includes('no-store'),true);
  assert.equal(read.data.patient.displayName,pet.displayName);
  assert.ok(read.data.access.scopes.includes('appointments'));
  assert.ok(!Object.hasOwn(read.data,'portalToken'));
  assert.ok(!Object.hasOwn(read.data,'clinicalData'));
  const second=await grant();
  grants.push(second.id);
  assert.equal((await portal(first.portalToken)).response.status,404,
    'rotating the grant must invalidate old token');
  assert.equal((await portal(second.portalToken)).response.status,200);
  const revoked=await h.ok('/verticals/veterinary/guardian-portal/grants/'+second.id+'/revoke',{
    method:'POST',body:'{}'
  });
  assert.ok(revoked.revokedAt);
  assert.equal((await portal(second.portalToken)).response.status,404);
  assert.equal((await portal(randomUUID())).response.status,404);
  const grantRows=await h.prisma.$queryRawUnsafe<Array<{revokedAt:Date|null}>>(
    'SELECT "revokedAt" FROM public."VeterinaryGuardianPortalGrant" WHERE "tenantId"=$1 AND "id"=$2',
    h.tenant.id,second.id);
  assert.ok(grantRows[0]?.revokedAt);
});
