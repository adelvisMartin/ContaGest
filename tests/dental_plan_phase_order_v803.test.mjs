import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('backend/src/modules/verticals/health.schemas.ts','utf8');
test('#803 ensures the scoped safety contract is present',()=>{
  assert.ok(source.includes("phaseOrders.has(phase.order)"));
  assert.ok(source.includes("path:['phases',index,'order']"));
  
  
});
