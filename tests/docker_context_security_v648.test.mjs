import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const patterns = readFileSync(join(root, '.dockerignore'), 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));
const rules = new Set(patterns);

// These are source-contract assertions; only Docker itself can prove its ignore matcher.
test('Docker build context excludes root and nested dotenv secrets', () => {
  for (const rule of ['.env', '.env.*', '**/.env', '**/.env.*']) {
    assert.ok(rules.has(rule), 'missing protective rule: ' + rule);
  }
  assert.ok(patterns.indexOf('!**/.env.example') > patterns.indexOf('**/.env.*'));
});

test('Docker build context excludes key material, Git metadata and generated dependencies', () => {
  for (const rule of [
    '.git', '**/.git', '**/.git/**', '**/node_modules', '**/node_modules/**',
    '**/dist', '**/dist/**', '**/build', '**/build/**',
    '**/*.pem', '**/*.key', '**/*.p12', '**/*.pfx',
    '**/id_rsa', '**/id_ed25519', '**/*service-account*.json', '**/*credentials*.json'
  ]) {
    assert.ok(rules.has(rule), 'missing protective rule: ' + rule);
  }
});

test('Docker build context has no blanket rule excluding workspace sources', () => {
  for (const forbidden of ['*', '**', 'backend', 'backend/**', 'frontend', 'frontend/**',
    'package.json', 'package-lock.json', 'backend/prisma', 'backend/scripts']) {
    assert.equal(rules.has(forbidden), false, 'build input excluded: ' + forbidden);
  }
});

test('Dockerfiles continue to load workspaces and package lock from context', () => {
  for (const name of ['Dockerfile.api', 'Dockerfile.web']) {
    const source = readFileSync(join(root, 'ops/docker', name), 'utf8');
    assert.match(source, /COPY package\.json package-lock\.json \.\//);
    assert.match(source, /COPY backend\/package\.json backend\/package\.json/);
    assert.match(source, /COPY frontend\/package\.json frontend\/package\.json/);
    assert.match(source, /RUN npm ci --no-audit --no-fund/);
  }
});

test('Dockerfiles do not explicitly COPY individual secret or env files', () => {
  for (const name of ['Dockerfile.api', 'Dockerfile.web']) {
    const source = readFileSync(join(root, 'ops/docker', name), 'utf8');
    const copies = source.split(/\r?\n/).filter((line) => /^\s*(COPY|ADD)\s/i.test(line));
    assert.ok(copies.length > 0);
    for (const line of copies) {
      assert.doesNotMatch(line, /(?:^|\s)(?:\S*\/)?(?:\.env(?:\.[^\s]*)?|[^\s]*\.(?:pem|p12|pfx|key))(?:\s|$)/i);
    }
  }
});
