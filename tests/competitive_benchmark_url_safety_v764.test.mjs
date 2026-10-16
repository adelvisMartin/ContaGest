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
