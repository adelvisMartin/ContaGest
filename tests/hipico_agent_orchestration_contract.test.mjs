import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gatesForFiles } from '../qa/support/domain-risk-catalog.mjs';

const skill=readFileSync(new URL('../.agents/skills/contagest-hipico-safe-automation/SKILL.md',import.meta.url),'utf8');

test('Control Hípico backend, Bridge, frontend and SQL changes route as critical risk',()=>{
  for(const file of [
    'backend/src/modules/hipico/document-engine.ts',
    'backend/src/modules/hipico-bot/hipico-webhook.routes.ts',
    'frontend/api/hipico/group-bridge-ingest.js',
    'frontend/public/hipico-control/app.js',
    'tools/hipico-whatsapp-web-bridge/src/index.mjs',
    'supabase/sql/hipico_v20_document_audit.sql'
  ]){
    const domain=gatesForFiles([file]).find((item)=>item.id==='control-hipico');
    assert.ok(domain,`missing Control Hípico routing for ${file}`);
    assert.equal(domain.severity,'critical');
    assert.ok(domain.skills.includes('contagest-hipico-safe-automation'));
    for(const gate of ['source-read-only','document-provenance','2000-isolation','physical-119','soak-120'])assert.ok(domain.gates.includes(gate),`${file} missing ${gate}`);
  }
});

test('Hípico safe automation skill keeps financial authority and same-SHA gates explicit',()=>{
  assert.match(skill,/SOURCE group is read-only/i);
  assert.match(skill,/financialAuthority=false/);
  assert.match(skill,/AnyDoc `0\.2\.4`/);
  assert.match(skill,/2000-scenario/i);
  assert.match(skill,/#119/);
  assert.match(skill,/#120/);
  assert.match(skill,/same SHA/i);
});
