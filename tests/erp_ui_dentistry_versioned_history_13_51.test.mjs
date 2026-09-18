import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page=()=>fs.readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');
const backend=()=>fs.readFileSync('backend/src/modules/verticals/health.routes.ts','utf8');
const audit=()=>fs.readFileSync('scripts/erp-ui-wave-a-audit-v251.mjs','utf8');

test('13/51 derives append-only version history per tooth surface',()=>{
  const source=page();
  for(const token of ['buildOdontogramHistory','previousCondition','version','changeReason','professionalName','actorUserId'])assert.ok(source.includes(token),token);
  assert.match(source,/sort\([^)]*createdAt/s);
  assert.doesNotMatch(source,/updateEncounter|deleteEncounter|rewriteOdontogramHistory/);
});

test('13/51 records explicit change reason in structured odontogram',()=>{
  const source=page();
  assert.match(source,/changeReason:encounterForm\.changeReason\.trim\(\)/);
  assert.match(source,/Motivo del cambio/);
  assert.match(source,/encounterForm\.changeReason\.trim\(\)/);
  assert.equal((source.match(/HealthVerticalService\.createEncounter\(/g)||[]).length,1);
});

test('13/51 backend validates reason and stamps authenticated actor into JSONB',()=>{
  const source=backend();
  assert.match(source,/changeReason:\s*z\.string\(\)\.trim\(\)\.min\(/);
  assert.match(source,/actorUserId:\s*ctx\(req\)\.userId/);
  assert.match(source,/JSON\.stringify\(persistedClinicalData\)/);
  assert.match(source,/type\s*===\s*'dental-treatment'/);
});

test('13/51 renders previous change author reason and version without hiding legacy history',()=>{
  const source=page();
  for(const token of ['Condición previa','Cambio','Autor','Motivo','Versión','Motivo no registrado (legado)'])assert.ok(source.includes(token),token);
  assert.ok(source.includes('CgDataTable'),'CgDataTable');
});

test('13/51 Wave A audit fails closed on history provenance regression',()=>{
  const source=audit();
  for(const token of ['buildOdontogramHistory','previousCondition','changeReason','actorUserId','Motivo no registrado (legado)'])assert.ok(source.includes(token),token);
});
