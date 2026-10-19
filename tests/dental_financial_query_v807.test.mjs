import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('backend/src/modules/verticals/health.schemas.ts','utf8');
test('#807 ensures the scoped safety contract is present',()=>{
  assert.ok(source.includes("patientId:z.string().trim().min(10).max(160).optional()"));
  
  assert.match(source,/dentalFinancialQuerySchema = z.object\([\s\S]*?\)\.strict\(\)/);
  
});
