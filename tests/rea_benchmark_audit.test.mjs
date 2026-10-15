import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const script = path.join(root, 'scripts/rea-benchmark-audit.mjs');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

function run(...args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
}

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'rea-audit-contract-'));
  const capture = '{"tool":"inspect_web_page","synthetic":true}\n';
  await writeFile(path.join(dir, 'rea.json'), capture);
  const manifest = {
    schemaVersion: 1,
    product: 'control-hipico',
    repoSha: sha,
    target: { name: 'Synthetic local example', url: 'http://127.0.0.1:5000/', access: 'public' },
    captureFile: 'rea.json',
    captureSha256: createHash('sha256').update(capture).digest('hex'),
    observations: [
      { objectiveId: 'CH-OFFLINE', benchmark: 'observed', ours: 'missing',
        externalEvidenceRefs: ['rea.json#screen1'],
        internalEvidenceRefs: ['qa/offline-review.md#no-feature'] }
    ]
  };
  const input = path.join(dir, 'audit.json');
  const output = path.join(dir, 'report.md');
  await writeFile(input, JSON.stringify(manifest));
  return { dir, input, output, manifest };
}

test('plan lists independent ERP and Hípico objectives without making release claims', () => {
  for (const product of ['contagest', 'control-hipico']) {
    const result = run('plan', '--product', product);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /review checklist/);
    assert.match(result.stdout, /Acceptance:/);
  }
  const bad = run('plan', '--product', 'unknown');
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /unknown product/);
});

test('report binds to exact SHA and capture hash; candidates are never verified gaps', async () => {
  const fx = await fixture();
  const result = run('report', '--input', fx.input, '--out', fx.output);
  assert.equal(result.status, 0, result.stderr);
  const report = await readFile(fx.output, 'utf8');
  assert.match(report, /GAP_CANDIDATE/);
  assert.match(report, /NEEDS_VERIFICATION/);
  assert.match(report, /PENDING_INDEPENDENT_REVIEW/);
  assert.match(report, new RegExp(sha));
  assert.doesNotMatch(report, /\|.*\| PASS \|/);
  const duplicate = run('report', '--input', fx.input, '--out', fx.output);
  assert.notEqual(duplicate.status, 0, 'report must not overwrite existing artifact');
});

test('absence without two evidence references is unknown, not a confirmed finding', async () => {
  const fx = await fixture();
  fx.manifest.observations[0].internalEvidenceRefs = [];
  await writeFile(fx.input, JSON.stringify(fx.manifest));
  assert.equal(run('report', '--input', fx.input, '--out', fx.output).status, 0);
  const report = await readFile(fx.output, 'utf8');
  assert.doesNotMatch(report, /GAP_CANDIDATE/);
  assert.match(report, /NEEDS_VERIFICATION/);
});

test('report refuses stale HEAD, forged capture hash, duplicate IDs and credentials', async () => {
  for (const mutate of [
    (m) => { m.repoSha = 'a'.repeat(40); },
    (m) => { m.captureSha256 = 'b'.repeat(64); },
    (m) => { m.observations.push({ ...m.observations[0] }); },
    (m) => { m.target.url = 'https://user:secret@example.org/'; },
    (m) => { m.target.url = 'https://example.org/?token=secret'; },
    (m) => { m.target.access = 'unknown'; },
    (m) => { m.observations[0].internalEvidenceRefs = ['../../secret']; },
    (m) => { m.observations[0].benchmark = 'verified'; },
  ]) {
    const fx = await fixture();
    mutate(fx.manifest);
    await writeFile(fx.input, JSON.stringify(fx.manifest));
    const result = run('report', '--input', fx.input, '--out', fx.output);
    assert.notEqual(result.status, 0, 'unsafe manifest accepted');
    assert.match(result.stderr, /REA_AUDIT_BLOCKED/);
  }
});

test('report refuses capture traversal or symlink escaping private folder', async () => {
  const fx = await fixture();
  fx.manifest.captureFile = '../outside.json';
  await writeFile(fx.input, JSON.stringify(fx.manifest));
  assert.notEqual(run('report', '--input', fx.input, '--out', fx.output).status, 0);
  await mkdir(path.join(fx.dir, 'captures'));
  const real = path.join(os.tmpdir(), 'rea-external-fixture-' + process.pid + '.json');
  await writeFile(real, '{"synthetic":true}');
  await symlink(real, path.join(fx.dir, 'captures', 'link.json'));
  fx.manifest.captureFile = 'captures/link.json';
  await writeFile(fx.input, JSON.stringify(fx.manifest));
  const result = run('report', '--input', fx.input, '--out', fx.output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /capture must be a regular file inside the audit folder/);
});
