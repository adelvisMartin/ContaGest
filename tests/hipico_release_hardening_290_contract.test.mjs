import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('v290 production gate is exact-SHA, current v12-v27, real-PostgreSQL, OCR capable and multi-browser without bypasses', async () => {
  const [workflow, guard, packageJson] = await Promise.all([
    read('.github/workflows/hipico-production-gates-v290.yml'),
    read('scripts/hipico-release-guard-v290.mjs'),
    read('package.json')
  ]);

  for (const marker of [
    'github.event.pull_request.head.sha || github.sha',
    'postgres:16',
    'poppler-utils',
    'tesseract-ocr-eng',
    'production-e2e-v290.ts',
    'hipico-restart-recovery-v290.ts prepare',
    'hipico-restart-recovery-v290.ts verify',
    'hipico-load-profile-v290.ts',
    'npm --workspace backend run test:hipico:agent',
    'browser: [chromium, firefox, webkit]',
    'npm audit --omit=dev --audit-level=high',
    'v12-v27'
  ]) assert.ok(workflow.includes(marker), `workflow missing ${marker}`);

  assert.doesNotMatch(workflow, /pull_request:\s*\n\s*branches:\s*\[main\]/);
  for (const forbidden of [
    /continue-on-error\s*:\s*true/,
    /waitForTimeout\s*\(/,
    /\bforce\s*:\s*true\b/,
    /\|\|\s*true/
  ]) assert.doesNotMatch(workflow, forbidden);

  assert.match(guard, /currentPostgresChain: 'v12-v27'/);
  assert.match(guard, /hipico_v23_risk_policy\.sql/);
  assert.match(guard, /hipico_v24_shadow_metrics\.sql/);
  assert.match(guard, /ownerApprovalServerControlled: true/);
  assert.match(guard, /MODEL_CANDIDATE_REQUIRES_REVIEW/);
  assert.match(guard, /RECENT_METRICS_INSUFFICIENT/);
  assert.match(guard, /FOR UPDATE SKIP LOCKED/);

  const pkg = JSON.parse(packageJson);
  assert.equal(pkg.scripts['release:hipico:v290'], 'node scripts/hipico-release-guard-v290.mjs');
  assert.equal(pkg.scripts['verify:hipico:evidence:v290'], 'node scripts/hipico-verify-evidence-v290.mjs');
  assert.equal(pkg.scripts['report:hipico:v290'], 'node scripts/hipico-release-report-v290.mjs');
});
