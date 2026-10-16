import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('backend/src/modules/verticals/health-core.routes.ts','utf8');
test('#809 ensures the scoped safety contract is present',()=>{
  assert.ok(source.includes("qRaw.length>120"));
  
  
  assert.ok(source.includes("new HttpError(422,'Tipo de paciente inválido.')"));assert.ok(source.includes('const kind=kindRaw||null;'));
});
