import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { inventory, stage } from '../scripts/hipico-split-inventory-v1394.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hipico-split-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'); mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture');
  for (const [path, body] of Object.entries({ 'backend/src/modules/hipico/a.ts': 'domain', 'backend/src/app.ts': 'import hipico', 'erp.ts': 'erp', 'tools/hipico-cli/.env': 'synthetic', 'scripts/hipico-job.mjs': 'job' })) {
    const target = join(repo, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, body);
  }
  git('add', '.');
  const linkOid = execFileSync('git', ['-C', repo, 'hash-object', '-w', '--stdin'], { input: 'erp.ts', encoding: 'utf8' }).trim();
  git('update-index', '--add', '--cacheinfo', `120000,${linkOid},hipico-link`);
  git('commit', '-m', 'fixture');
  return { root, repo, sha: git('rev-parse', 'HEAD'), git };
}
const approvalFor = (sha, ...files) => ({ sourceSha: sha, files: files.map(({path, oid}) => ({path, oid, reason: 'fixture approval'})) });
test('classifies tracked exact-SHA paths, shared references, blocked files and symlinks', t => {
  const { repo, sha } = fixture(t);
  const files = new Map(inventory(repo, sha).files.map(file => [file.path, file]));
  assert.equal(files.get('backend/src/modules/hipico/a.ts').category, 'domain-review');
  assert.equal(files.get('backend/src/app.ts').category, 'cross-reference-review');
  assert.equal(files.get('scripts/hipico-job.mjs').category, 'named-review');
  assert.equal(files.get('erp.ts').category, 'unclassified');
  assert.equal(files.get('tools/hipico-cli/.env').category, 'blocked');
  assert.equal(files.get('hipico-link').category, 'blocked');
  assert.throws(() => inventory(repo, 'HEAD'));
});
test('stages only approved immutable blobs and records provenance', t => {
  const { root, repo, sha, git } = fixture(t);
  const file = inventory(repo, sha).files.find(f => f.category === 'domain-review');
  writeFileSync(join(repo, file.path), 'dirty working tree');
  const dest = join(root, 'stage');
  assert.equal(stage(repo, sha, approvalFor(sha, file), dest), 1);
  assert.equal(readFileSync(join(dest, file.path), 'utf8'), 'domain');
  assert.equal(existsSync(join(dest, 'erp.ts')), false);
  assert.equal(JSON.parse(readFileSync(join(dest, 'split-provenance.json'))).sourceSha, sha);
  assert.equal(git('rev-parse', 'HEAD'), sha);
  assert.throws(() => stage(repo, sha, approvalFor(sha, file), dest));
});
test('rejects stale, duplicate, blocked and inside-checkout staging before output', t => {
  const { root, repo, sha } = fixture(t);
  const files = inventory(repo, sha).files;
  const file = files.find(f => f.category === 'domain-review');
  const blocked = files.find(f => f.path.endsWith('/.env'));
  const dest = join(root, 'stage');
  for (const approval of [approvalFor('0'.repeat(40), file), approvalFor(sha, {...file, oid: '0'.repeat(40)}), approvalFor(sha, file, file), approvalFor(sha, blocked), approvalFor(sha)]) {
    assert.throws(() => stage(repo, sha, approval, dest)); assert.equal(existsSync(dest), false);
  }
  assert.throws(() => stage(repo, sha, approvalFor(sha, file), join(repo, 'stage')));
  assert.equal(existsSync(join(repo, 'stage')), false);
  symlinkSync(repo, join(root, 'alias'), 'junction');
  assert.throws(() => stage(repo, sha, approvalFor(sha, file), join(root, 'alias', 'stage')));
  assert.equal(existsSync(join(repo, 'stage')), false);
});
