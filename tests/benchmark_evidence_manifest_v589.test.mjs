import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('docs/evidence/benchmark-evidence-manifest-v589.json', 'utf8'));
const verifier = fs.readFileSync('scripts/verify-benchmark-evidence-v589.mjs', 'utf8');

const expected = ['enterprise', 'empresas', 'odontologia', 'gimnasio', 'veterinaria', 'control-hipico'];

test('#589 contains every requested vertical and the exact four-state vocabulary', () => {
  assert.deepEqual(manifest.statusVocabulary, ['VERIFIED', 'PARTIAL', 'NOT_VERIFIED', 'NOT_APPLICABLE']);
  assert.deepEqual(manifest.verticals.map((item) => item.id).sort(), [...expected].sort());
});

test('#589 capabilities carry real evidence references or explicit non-verification', () => {
  for (const vertical of manifest.verticals) {
    for (const capability of vertical.capabilities) {
      assert.ok(['VERIFIED', 'PARTIAL', 'NOT_VERIFIED', 'NOT_APPLICABLE'].includes(capability.status));
      assert.ok(['VERIFIED', 'PARTIAL', 'NOT_VERIFIED', 'NOT_APPLICABLE'].includes(capability.runtime));
      const evidenceCount = capability.routes.length + capability.apis.length + capability.tests.length + capability.history.length;
      assert.ok(evidenceCount > 0 || ['NOT_VERIFIED', 'NOT_APPLICABLE'].includes(capability.status));
    }
  }
});

test('#589 verifier deduplicates and validates routes, tests, history, API prefix and secrets', () => {
  assert.match(verifier, /DUPLICATE_CAPABILITY/);
  assert.match(verifier, /UNKNOWN_ROUTE/);
  assert.match(verifier, /MISSING_TEST/);
  assert.match(verifier, /INVALID_HISTORY_REF/);
  assert.match(verifier, /NON_CANONICAL_API/);
  assert.match(verifier, /POTENTIAL_SECRET_IN_MANIFEST/);
  assert.match(verifier, /VERIFIED_WITHOUT_RUNTIME/);
});
