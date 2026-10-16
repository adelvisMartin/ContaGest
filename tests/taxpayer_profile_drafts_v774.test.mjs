import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTaxpayerProfileDraft } from '../backend/src/modules/fiscal/taxpayer-profile-policy.ts';
const ctx={tenantId:'tenant-1',userId:'actor-1',tenantRif:'J-00000000-0'};
const input={effectiveFrom:'2026-01-01T00:00:00Z',effectiveTo:'2027-01-01T00:00:00Z',jurisdiction:'Municipio de prueba',taxpayerCategory:'Clasificación pendiente',activityCodes:['A10','B20'],sourceReference:'Documento legal por verificar',sourceContentSha256:'a'.repeat(64)};
const dt=new Date('2026-10-16T00:00:00Z');
const go=(patch={},c=ctx)=>prepareTaxpayerProfileDraft({...input,...patch},c,dt);
const no=fn=>assert.throws(fn,{message:'TAXPAYER_PROFILE_DRAFT_INVALID'});
test('#774 RIF and owner identity are server-bound in immutable DRAFT',()=>{
  const d=go();assert.equal(d.rifSnapshot,ctx.tenantRif);assert.equal(d.status,'DRAFT');
  assert.equal(d.tenantId,ctx.tenantId);assert.ok(Object.isFrozen(d.activityCodes));assert.equal(d.capturedAt,dt.toISOString());
});
test('#774 rejects attacker tenant/RIF/category approval injection',()=>{
  for(const extra of [{tenantId:'tenant-2'},{rifSnapshot:'fake'},{status:'ACTIVE'},{reviewedBy:'attacker'},{version:999}])no(()=>go(extra));
});
test('#774 rejects invalid timezones and boundaries',()=>{
  for(const effectiveFrom of ['2026-02-30T00:00:00Z','2026-01-01','2026-01-01T00:00:00+01:00'])no(()=>go({effectiveFrom}));
  no(()=>go({effectiveTo:input.effectiveFrom}));
  no(()=>go({effectiveTo:'2025-01-01T00:00:00Z'}));
  assert.equal(go({effectiveTo:null}).effectiveTo,null);
});
test('#774 blocks untrusted activities and bad provenance',()=>{
  no(()=>go({activityCodes:[]}));no(()=>go({activityCodes:['x','x']}));
  no(()=>go({activityCodes:['../../bad']}));no(()=>go({sourceContentSha256:'bad'}));
  no(()=>go({}, {...ctx,tenantRif:''}));no(()=>go({taxpayerCategory:''}));
});
