import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCompetitiveBenchmark } from '../scripts/verify-competitive-benchmark-v764.mjs';

const actual=JSON.parse(readFileSync(new URL('../config/competitive-benchmark-v764.json',import.meta.url),'utf8'));
const fresh=()=>structuredClone(actual);
test('#764 existing vendor matrix remains valid and source reuse blocked',()=>{
  assert.deepEqual(validateCompetitiveBenchmark(actual),[]);
  assert.ok(actual.features.every(x=>x.sourceReuse==='NONE'));
});
test('#764 official source URL must not carry query-based API key or token',()=>{
  for(const url of ['https://docs.example.org/?api_key=secret','https://docs.example.org/?apikey=s',
    'https://docs.example.org/path?signature=s', 'https://docs.example.org/path#token-123']){
    const c=fresh(); c.sources[0].sourceUrl=url;
    assert.match(validateCompetitiveBenchmark(c).join(';'),/source lacks HTTPS provenance/);
  }
});
test('#764 provenance must not point into local or private IP services',()=>{
  for(const url of ['https://localhost/docs','https://x.internal/docs','https://127.0.0.1/',
    'https://10.10.1.2/','https://[::1]/doc','https://router.local/docs']){
    const c=fresh(); c.sources[0].sourceUrl=url;
    assert.match(validateCompetitiveBenchmark(c).join(';'),/source lacks HTTPS provenance/);
  }
});
test('#764 feature evidence links must also be public, uncredentialed URLs',()=>{
  const c=fresh();
  const row=c.features.find(x=>x.referenceEvidenceLevel==='DOCUMENTED');
  row.referenceEvidenceUrl='https://example.org/feature?api_key=PRIVATE';
  assert.match(validateCompetitiveBenchmark(c).join(';'),/unsupported reference feature claim/);
});
test('#764 license provenance also requires safe, public documentation URL',()=>{
  const c=fresh();
  const src=c.sources.find(x=>x.id==='erpnext');
  src.licenseEvidenceUrl='https://license.example.org/v1#secret';
  assert.match(validateCompetitiveBenchmark(c).join(';'),/licensed source lacks evidence/);
});
test('#764 a real HTTPS documentation URL remains valid',()=>{
  const c=fresh(); c.sources[0].sourceUrl='https://docs.example.org/feature';
  assert.ok(!validateCompetitiveBenchmark(c).some(x=>/source lacks HTTPS provenance/.test(x)));
});

test('#707 documented feature must belong to the named vendor, not any HTTPS site',()=>{
  const c=fresh();
  const row=c.features.find(x=>x.id==='VEOSS-001');
  assert.equal(row.referenceEvidenceLevel,'DOCUMENTED');
  row.referenceEvidenceUrl='https://unrelated.example.org/features';
  assert.match(validateCompetitiveBenchmark(c).join(';'),/unsupported reference feature claim: VEOSS-001/);
  row.referenceEvidenceUrl='https://www.miprofit.com/productos/';
  assert.deepEqual(validateCompetitiveBenchmark(c),[]);
});

test('#707 GitHub evidence is scoped to the exact publisher repository',()=>{
  const c=fresh();
  const row=c.features.find(x=>x.productId==='wger'&&x.referenceEvidenceLevel==='DOCUMENTED');
  assert.ok(row);
  for(const url of [
    'https://github.com/other/repo',
    'https://github.com/wger-project/wger-copy',
    'https://github.com/wger-project/wger-evil/blob/main/LICENSE',
    'https://github.com/frappe/erpnext',
  ]){
    row.referenceEvidenceUrl=url;
    assert.match(validateCompetitiveBenchmark(c).join(';'),new RegExp('unsupported reference feature claim: '+row.id));
  }
  row.referenceEvidenceUrl='https://github.com/wger-project/wger/blob/master/README.md';
  assert.deepEqual(validateCompetitiveBenchmark(c),[]);
});

test('#707 ERPNext first-party documentation may use reviewed Frappe origin, not lookalikes',()=>{
  const c=fresh();
  const row=c.features.find(x=>x.id==='VEOSS-015');
  assert.ok(row);
  for(const url of [
    'https://docs.frappe.io/frappe/selling',
    'https://docs.frappe.io/erpnext-copy/selling',
    'https://docs.frappe.io.evil.example/erpnext/selling',
    'https://github.com/other/repo',
  ]){
    row.referenceEvidenceUrl=url;
    assert.match(validateCompetitiveBenchmark(c).join(';'),/unsupported reference feature claim: VEOSS-015/);
  }
  row.referenceEvidenceUrl='https://docs.frappe.io/erpnext/selling';
  assert.deepEqual(validateCompetitiveBenchmark(c),[]);
  c.sources.find(x=>x.id==='erpnext').sourceUrl='https://github.com/another/erpnext';
  assert.match(validateCompetitiveBenchmark(c).join(';'),/unsupported reference feature claim: VEOSS-015/);
});

test('#707 unresolved and secondary sources cannot claim documented official parity',()=>{
  const c=fresh();
  const row=c.features.find(x=>x.id==='VEOSS-010');
  const owner=c.sources.find(x=>x.id==='sac');
  owner.sourceLevel='SECONDARY';
  assert.match(validateCompetitiveBenchmark(c).join(';'),/unsupported reference feature claim: VEOSS-010/);
  row.referenceEvidenceLevel='PROVISIONAL';
  row.referenceEvidenceUrl=null;
  assert.ok(!validateCompetitiveBenchmark(c).some(x=>x.includes('unsupported reference feature claim: VEOSS-010')));
});

test('#707 license proof stays on publisher repository or explicitly reviewed official URL',()=>{
  for(const sourceId of ['dolibarr','wger','opendentist','openvpm','erpnext','akaunting','tryton','invoice-ninja']){
    const c=fresh(),s=c.sources.find(x=>x.id===sourceId);
    assert.ok(s,sourceId);
    assert.deepEqual(validateCompetitiveBenchmark(c),[],sourceId);
    s.licenseEvidenceUrl='https://unrelated.example.org/legitimate-looking-license';
    assert.match(validateCompetitiveBenchmark(c).join(';'),
      new RegExp('licensed source lacks evidence \\(publisher mismatch\\): '+sourceId));
  }
});
test('#707 GitHub license URL cannot impersonate another owner or repository',()=>{
  const c=fresh(),s=c.sources.find(x=>x.id==='dolibarr');
  for(const url of [
    'https://github.com/other/dolibarr/blob/main/COPYING',
    'https://github.com/Dolibarr/dolibarr-copy/blob/main/COPYING',
    'https://github.com/Dolibarr/another/blob/main/COPYING'
  ]) {
    s.licenseEvidenceUrl=url;
    assert.match(validateCompetitiveBenchmark(c).join(';'),/licensed source lacks evidence \(publisher mismatch\): dolibarr/);
  }
});
