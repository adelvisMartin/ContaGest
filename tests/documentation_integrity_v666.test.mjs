import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { auditDocumentation, CRITICAL_DOCUMENTS } from '../scripts/documentation-integrity-v666.mjs';

function fixture(callback) {
  const root = mkdtempSync(path.join(tmpdir(), 'cg-docs-666-'));
  const put = (filename, content) => {
    mkdirSync(path.dirname(path.join(root, filename)), { recursive: true });
    writeFileSync(path.join(root, filename), content);
  };
  try {
    put('package.json', JSON.stringify({ scripts: { 'test:docs': 'node tests/check.mjs' } }));
    put('backend/package.json', JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } }));
    put('frontend/package.json', JSON.stringify({ scripts: { build: 'vite build' } }));
    put('scripts/check.mjs', '// real script');
    put('docs/guide.md', '# Guide\n');
    return callback({ root, put, check: (documents = ['README.md'], superseded = {}) => auditDocumentation({ root, documents, superseded }) });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('#666 accepts existing local links, internal anchors and documented root/workspace commands', () => fixture(({ put, check }) => {
  put('README.md', '[Guide](docs/guide.md#section)\n[Issue](https://github.com/o/r/issues/6)\n[Here](#section)\n`npm run test:docs`\n`npm --workspace backend run typecheck`\n`node scripts/check.mjs`\n');
  assert.deepEqual(check().findings, []);
}));

test('#666 reports broken links and absent executable commands without executing them', () => fixture(({ put, check }) => {
  put('README.md', '[Gone](docs/not-here.md)\n`npm run fake:task`\n`node scripts/unknown.mjs`');
  assert.deepEqual(check().findings.map(x => x.code), ['LINK_MISSING', 'NPM_SCRIPT_MISSING', 'NODE_SCRIPT_MISSING']);
}));

test('#666 marks superseded authority when explicit migration notice is absent', () => fixture(({ put, check }) => {
  put('README.md', '# Historical style guide');
  assert.equal(check(['README.md'], { 'README.md': 'AGENTS.md' }).findings[0].code, 'SUPERSEDED_UNMARKED');
  put('README.md', '> SUPERSEDED AUTHORITY: AGENTS.md\n# Historical style guide');
  assert.equal(check(['README.md'], { 'README.md': 'AGENTS.md' }).status, 'PASS');
}));

test('#666 rejects links outside the checkout and missing critical documents', () => fixture(({ put, check }) => {
  put('README.md', '[Secret](../outside.txt)');
  assert.deepEqual(check(['README.md', 'docs/missing.md']).findings.map(x => x.code), ['DOCUMENT_MISSING', 'LINK_TRAVERSAL']);
}));

test('#666 is deterministic and errors cannot leak filesystem secrets', () => fixture(({ put, check }) => {
  put('README.md', '[Z](docs/z.md)\n[A](docs/a.md)');
  assert.deepEqual(check(), check());
  assert.ok(CRITICAL_DOCUMENTS.includes('AGENTS.md'));
  assert.equal(JSON.stringify(check()).includes('cg-docs-666-'), false);
}));

test('#666 refuses symlinked local documentation links escaping the checkout', () => fixture(({ root, put, check }) => {
  const external = mkdtempSync(path.join(tmpdir(), 'cg-docs-external-'));
  try {
    writeFileSync(path.join(external, 'secret.md'), 'secret outside the checkout');
    mkdirSync(path.join(root, 'docs', 'aliases'), { recursive: true });
    symlinkSync(path.join(external, 'secret.md'), path.join(root, 'docs', 'aliases', 'secret.md'));
    symlinkSync(external, path.join(root, 'docs', 'outside'));
    put('README.md', '[File](docs/aliases/secret.md)\n[Directory](docs/outside/secret.md)');
    assert.deepEqual(check().findings.map(x => x.code), ['LINK_TRAVERSAL', 'LINK_TRAVERSAL']);
    assert.equal(JSON.stringify(check()).includes('cg-docs-external-'), false);
  } finally { rmSync(external, { recursive: true, force: true }); }
}));

test('#666 refuses to read a critical document symlinked outside checkout', () => fixture(({ root, check }) => {
  const external = mkdtempSync(path.join(tmpdir(), 'cg-docs-secret-'));
  try {
    const secret = path.join(external, 'secrets.md');
    writeFileSync(secret, 'TOP_SECRET_DO_NOT_READ\n[nasty](../../real.md)');
    symlinkSync(secret, path.join(root, 'README.md'));
    const report = check();
    assert.deepEqual(report.findings.map(x => x.code), ['DOCUMENT_TRAVERSAL']);
    assert.equal(JSON.stringify(report).includes('TOP_SECRET_DO_NOT_READ'), false);
  } finally { rmSync(external, { recursive: true, force: true }); }
}));

test('#666 still accepts symlinks with targets contained in the checkout', () => fixture(({ root, put, check }) => {
  put('docs/actual.md', '# Existing internal file');
  symlinkSync('actual.md', path.join(root, 'docs', 'alias.md'));
  put('README.md', '[Internal](docs/alias.md)');
  assert.deepEqual(check().findings, []);
}));


test('#666 validates reference-style links with canonical relative resolution', () => fixture(({ put, check }) => {
  put('README.md', '[Guide][GUIDE]\n[guide]: <docs/guide.md> "Guide"\n');
  assert.deepEqual(check().findings, []);
  put('README.md', '[Gone][guide]\n[guide]: docs/missing.md\n');
  assert.deepEqual(check().findings.map(x => x.code), ['LINK_MISSING']);
}));

test('#666 rejects undefined reference IDs and ignores literal examples', () => fixture(({ put, check }) => {
  put('README.md', '[Broken][unknown]\n' + '\x60[literal][not-a-ref]\x60\n');
  assert.deepEqual(check().findings.map(x => x.code), ['LINK_REFERENCE_UNDEFINED']);
  assert.equal(check().findings[0].line, 1);
}));

test('#666 applies symlink/traversal protection to reference definitions', () => fixture(({ root, put, check }) => {
  const external = mkdtempSync(path.join(tmpdir(), 'cg-docs-ref-external-'));
  try {
    writeFileSync(path.join(external, 'secret.md'), 'EXTERNAL_SECRET');
    symlinkSync(path.join(external, 'secret.md'), path.join(root, 'docs', 'escaped.md'));
    put('README.md', '[Escape][r]\n[r]: docs/escaped.md\n');
    assert.deepEqual(check().findings.map(x => x.code), ['LINK_TRAVERSAL']);
    assert.equal(JSON.stringify(check()).includes('EXTERNAL_SECRET'), false);
  } finally { rmSync(external, { recursive: true, force: true }); }
}));
