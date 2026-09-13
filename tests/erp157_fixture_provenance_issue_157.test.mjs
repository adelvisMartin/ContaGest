import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/erp-performance-capacity-v157.yml','utf8');
const assembler=fs.readFileSync('scripts/erp-performance-assemble-v157.mjs','utf8');

test('#157 evidence cannot self-assert sanitized fixtures without workflow provenance',()=>{
  assert.match(workflow,/ERP157_FIXTURE_POLICY:\s*['"]SYNTHETIC_TEST_ONLY['"]/);
  assert.match(assembler,/process\.env\.ERP157_FIXTURE_POLICY/);
  assert.match(assembler,/ERP157_FIXTURE_PROVENANCE_REQUIRED/);
  assert.match(assembler,/sanitizedFixtures/);
});
