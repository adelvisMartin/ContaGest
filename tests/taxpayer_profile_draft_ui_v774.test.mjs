import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BackendApi } from '../frontend/src/services/backendApi.js';
import { FiscalService } from '../frontend/src/services/fiscalService.js';
import { buildTaxpayerDraftSubmission } from '../frontend/src/services/taxpayerDraftForm.js';

const jsx=readFileSync(new URL('../frontend/src/pages/TaxesPage.jsx',import.meta.url),'utf8');
const sha='a'.repeat(64);
const valid={effectiveFrom:'2026-10-19',effectiveTo:'2026-11-19',jurisdiction:'Municipio de prueba',taxpayerCategory:'Categoría documentada',activityCodes:'ACT-1, ACT-2',sourceReference:'Expediente revisado por responsable fiscal',sourceContentSha256:sha};

test('#774 profile drafting serializes UTC effective boundaries, source hash and activity codes',()=>{
  assert.deepEqual(buildTaxpayerDraftSubmission(valid),{
    effectiveFrom:'2026-10-19T00:00:00Z',effectiveTo:'2026-11-19T00:00:00Z',
    jurisdiction:valid.jurisdiction,taxpayerCategory:valid.taxpayerCategory,
    activityCodes:['ACT-1','ACT-2'],sourceReference:valid.sourceReference,sourceContentSha256:sha
  });
});

test('#774 invalid dates, hash, activity duplicates and unsafe separators are rejected before POST',()=>{
  const invalid=[
    {...valid,effectiveFrom:'2026-02-30'},
    {...valid,effectiveTo:'2026-10-18'},
    {...valid,sourceContentSha256:'unverified'},
    {...valid,activityCodes:'ACT-1,ACT-1'},
    {...valid,activityCodes:'ACT-1,ACT|2'},
    {...valid,jurisdiction:'XX'},
  ];
  for(const data of invalid)assert.throws(()=>buildTaxpayerDraftSubmission(data));
  assert.equal(buildTaxpayerDraftSubmission({...valid,effectiveTo:''}).effectiveTo,null);
});

test('#774 API reads and writes audited profile drafts under /fiscal/taxpayer-profiles',async()=>{
  const get=BackendApi.get,post=BackendApi.post;
  const paths=[];
  try{
    BackendApi.get=async(path)=>{paths.push(path);return [];};
    BackendApi.post=async(path,data)=>{paths.push(path);return {status:'DRAFT',...data};};
    await FiscalService.taxpayerProfiles();
    const created=await FiscalService.captureTaxpayerProfileDraft(buildTaxpayerDraftSubmission(valid));
    assert.deepEqual(paths,['/fiscal/taxpayer-profiles','/fiscal/taxpayer-profiles']);
    assert.equal(created.status,'DRAFT');
  }finally{BackendApi.get=get;BackendApi.post=post;}
});

test('#774 UI presents candidates as non-active and gates draft capture on server capabilities',()=>{
  assert.match(jsx,/FiscalService\.taxpayerProfiles\(/);
  assert.match(jsx,/FiscalService\.captureTaxpayerProfileDraft\(/);
  assert.match(jsx,/capabilities\?\.close/);
  assert.match(jsx,/Perfil tributario.*BORRADOR|BORRADOR.*Perfil tributario/s);
  assert.match(jsx,/no habilita cálculos fiscales|no activa reglas fiscales/i);
  assert.match(jsx,/sourceContentSha256/);
  assert.match(jsx,/setProfiles\(/);
});
