import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('PR-I release evidence requires the exact-SHA static verification gate', async () => {
  const [workflow, verifier] = await Promise.all([
    read('.github/workflows/hipico-production-gates-v290.yml'),
    read('scripts/hipico-verify-evidence-v290.mjs')
  ]);

  for (const marker of [
    'npm run test:hipico',
    'npm run typecheck',
    'npm run build',
    'npm run check:bundle',
    "schema: 'hipico-static-gate.v290-current'",
    'sha: process.env.HIPICO_CANDIDATE_SHA'
  ]) {
    assert.ok(workflow.includes(marker), `static release workflow missing ${marker}`);
  }

  assert.match(
    verifier,
    /\{ id: 'staticGate', name: 'static-gate\.json', schemas: \['hipico-static-gate\.v290-current'\] \}/,
    'static-gate.json must be a required exact-SHA evidence descriptor'
  );

  const requiredBlock = verifier.slice(
    verifier.indexOf('const requiredDescriptors = ['),
    verifier.indexOf('const optionalDescriptors = [')
  );
  assert.match(requiredBlock, /id: 'staticGate'/, 'staticGate must stay required');
});
