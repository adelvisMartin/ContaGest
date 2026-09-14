import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('scripts/erp-performance-finalize-v157.mjs','utf8');

test('#157 finalizer closes only a final PASS, never MEASURED_PROVISIONAL',()=>{
  assert.match(source,/summary\.verdict!==['"]PASS['"]/);
  assert.doesNotMatch(source,/\[['"]PASS['"],['"]MEASURED_PROVISIONAL['"]\]\.includes\(summary\.verdict\)/);
  assert.match(source,/ISSUE_155_MUST_BE_CLOSED_BEFORE_157/);
  assert.match(source,/PERFORMANCE_MEASUREMENT_HASH_REQUIRED/);
});
