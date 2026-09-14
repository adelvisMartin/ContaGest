import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/erp-performance-capacity-v157.yml','utf8');
const assembler=fs.readFileSync('scripts/erp-performance-assemble-v157.mjs','utf8');
const frontend=fs.readFileSync('qa/erp-performance-frontend-v157.spec.mjs','utf8');

test('#157 evidence cannot self-assert sanitized fixtures without current workflow provenance',()=>{
  assert.match(workflow,/ERP157_FIXTURE_PROVENANCE:\s*['"]SYNTHETIC_TEST_ONLY['"]/);
  assert.match(assembler,/process\.env\.ERP157_FIXTURE_PROVENANCE/);
  assert.match(assembler,/frontend\.fixtureProvenance===expectedFixtureProvenance/);
  assert.match(assembler,/PERFORMANCE_FIXTURE_PROVENANCE_REQUIRED/);
  assert.match(assembler,/sanitizedFixtures:provenanceVerified/);
  assert.match(frontend,/fixtureProvenance:\s*'SYNTHETIC_TEST_ONLY'/);
});
