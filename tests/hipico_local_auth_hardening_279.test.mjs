import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { __test__ } from '../frontend/public/hipico-control/assets/js/local-auth.js';

function validRecord() {
  return {
    version: 2,
    algorithm: __test__.ENROLLMENT_ALGORITHM,
    iterations: __test__.PBKDF2_ITERATIONS,
    emailHash: 'a'.repeat(64),
    salt: 'b'.repeat(32),
    verifier: 'c'.repeat(64)
  };
}

test('offline enrollment accepts only bounded v2 verifier metadata', () => {
  const record = validRecord();
  assert.equal(__test__.validEnrollmentRecord(record), true);
  assert.equal(__test__.validEnrollmentRecord({ ...record, iterations: 999_999_999 }), false);
  assert.equal(__test__.validEnrollmentRecord({ ...record, algorithm: 'PBKDF2-SHA1' }), false);
  assert.equal(__test__.validEnrollmentRecord({ ...record, salt: 'b'.repeat(34) }), false);
  assert.equal(__test__.validEnrollmentRecord({ ...record, verifier: 'c'.repeat(62) }), false);
  assert.equal(__test__.validEnrollmentRecord({ ...record, emailHash: 'not-hex'.padEnd(64, 'z') }), false);
});

test('legacy v2 records without explicit algorithm or iteration fields keep the canonical safe defaults', () => {
  const record = validRecord();
  delete record.algorithm;
  delete record.iterations;
  assert.equal(__test__.validEnrollmentRecord(record), true);
});

test('offline verification never derives PBKDF2 work from mutable IndexedDB iteration metadata', async () => {
  const source = await fs.readFile('frontend/public/hipico-control/assets/js/local-auth.js', 'utf8');
  assert.match(source, /deriveVerifier\(password, hexToBytes\(record\.salt\), PBKDF2_ITERATIONS\)/);
  assert.doesNotMatch(source, /deriveVerifier\(password, hexToBytes\(record\.salt\), Number\(record\.iterations/);
});


test('cloud login authorizes Control Hípico before creating offline enrollment', async () => {
  const source = await fs.readFile('frontend/public/hipico-control/assets/js/app.js', 'utf8');
  const start = source.indexOf('if (formId === "auth-form")');
  const end = source.indexOf('if (formId === "race-form")', start);
  const block = source.slice(start, end);
  const auth = block.indexOf('await signIn(email, password)');
  const access = block.indexOf('await fetchCloudAccess()');
  const enrollment = block.indexOf('await enrollLocalAdmin(email, password)');
  assert.ok(auth >= 0 && access > auth && enrollment > access, 'cloud identity must be followed by product authorization before offline enrollment');
  assert.match(block, /if \(!cloudAccess\)/);
  assert.match(block, /cloudAccess\.status !== "active"/);
  assert.match(block, /clearLocalAdminEnrollment/);
});

test('transient access verification can use only a previously enrolled matching offline credential', async () => {
  const source = await fs.readFile('frontend/public/hipico-control/assets/js/app.js', 'utf8');
  const start = source.indexOf('let cloudAccess = null;');
  const end = source.indexOf('if (!cloudAccess)', start);
  const block = source.slice(start, end);
  assert.match(block, /isTransientCloudError\(accessError\)/);
  assert.match(block, /hasLocalAdminEnrollment\(\)/);
  assert.match(block, /verifyLocalAdmin\(email, password\)/);
  assert.match(block, /await signOut\(\)/);
  assert.doesNotMatch(block, /enrollLocalAdmin/);
});

test('cloud shell renders from safe local state before remote profile and workspace hydration', async () => {
  const source = await fs.readFile('frontend/public/hipico-control/assets/js/app.js', 'utf8');
  const start = source.indexOf('if (mode === "cloud" && currentSession())');
  const end = source.indexOf('if (mode === "local")', start);
  const block = source.slice(start, end);
  const render = block.indexOf('render();');
  const profile = block.indexOf('await fetchCloudProfile()');
  const workspace = block.indexOf('await fetchCloudWorkspace()');
  assert.ok(render >= 0 && profile > render && workspace > profile, 'local shell must not wait on optional cloud hydration');
});
