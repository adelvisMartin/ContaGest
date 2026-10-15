#!/usr/bin/env node
// Defensive REA evidence report. Does not crawl, operate browsers or assert gaps automatically.
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const shaPattern = /^[a-f0-9]{40}$/i;
function requireThat(condition, message) {
  if (!condition) throw new Error('REA_AUDIT_BLOCKED: ' + message);
}
function flag(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
function safe(value) {
  return String(value).replace(/[\r\n\t|<>\x60]/g, ' ').slice(0, 500);
}
function references(value) {
  requireThat(Array.isArray(value), 'evidence references must be arrays');
  for (const ref of value) {
    requireThat(typeof ref === 'string' && /^[\w./:# -]{1,240}$/.test(ref) &&
      !ref.includes('..') && !ref.includes('://'), 'unsafe evidence reference');
  }
  return value;
}
function validateTarget(target) {
  requireThat(target && typeof target.name === 'string' && target.name.trim().length > 1 &&
    target.name.length <= 100, 'target name missing');
  requireThat(['public', 'written-permission'].includes(target.access), 'authorization basis missing');
  const url = new URL(target.url);
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  requireThat(url.protocol === 'https:' || local, 'target must be HTTPS or loopback');
  requireThat(!url.username && !url.password && !url.search && !url.hash,
    'target URLs must not contain credentials, query strings or fragments');
}
function capturePath(manifestFile, rel) {
  requireThat(typeof rel === 'string' && rel.endsWith('.json') && /^[\w./-]+$/.test(rel) &&
    !path.isAbsolute(rel) && !rel.split('/').includes('..'), 'unsafe capture file path');
  const base = path.dirname(manifestFile);
  const absolute = path.resolve(base, rel);
  requireThat(absolute.startsWith(base + path.sep), 'capture escapes audit directory');
  return absolute;
}
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function headSha() {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
  requireThat(shaPattern.test(sha), 'HEAD unavailable');
  return sha;
}
async function main() {
  const matrix = JSON.parse(await readFile(path.join(root, 'config/rea-benchmark-objectives-v1.json'), 'utf8'));
  requireThat(matrix.schemaVersion === 1 && Array.isArray(matrix.products), 'objective matrix invalid');
  const mode = process.argv[2];
  if (mode === 'plan') {
    const product = matrix.products.find((item) => item.id === flag('--product'));
    requireThat(product, 'unknown product');
    console.log('# REA review checklist — ' + product.name);
    console.log('\nThese objectives are not claims of implemented behavior.');
    for (const item of product.objectives) {
      console.log('\n- ' + item.id + ' [' + item.risk + '] ' + item.goal);
      console.log('  Acceptance: ' + item.acceptance);
      console.log('  Repository owners to verify: ' + item.owners.join(', '));
    }
    return;
  }
  requireThat(mode === 'report', 'usage: plan --product ID | report --input FILE --out FILE.md');
  const input = flag('--input');
  const out = flag('--out');
  requireThat(input && out && out.endsWith('.md'), 'input and output .md required');
  const manifestFile = path.resolve(input);
  const outFile = path.resolve(out);
  requireThat(manifestFile !== outFile, 'output cannot overwrite input');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  requireThat(manifest.schemaVersion === 1, 'manifest schema invalid');
  const product = matrix.products.find((item) => item.id === manifest.product);
  requireThat(product, 'unknown product');
  validateTarget(manifest.target);
  const sha = headSha();
  requireThat(shaPattern.test(manifest.repoSha) && sha === manifest.repoSha,
    'manifest repoSha differs from checked-out HEAD');
  const parent = await realpath(path.dirname(manifestFile));
  const capture = await realpath(capturePath(manifestFile, manifest.captureFile));
  requireThat(capture.startsWith(parent + path.sep) && (await stat(capture)).isFile(),
    'capture must be a regular file inside the audit folder');
  const captureSha = await digest(capture);
  requireThat(typeof manifest.captureSha256 === 'string' &&
    /^[0-9a-f]{64}$/i.test(manifest.captureSha256) &&
    captureSha === manifest.captureSha256.toLowerCase(), 'capture SHA-256 mismatch');
  requireThat(Array.isArray(manifest.observations), 'observations must be an array');
  const goals = new Map(product.objectives.map((item) => [item.id, item]));
  const observedIds = new Set();
  const findings = [];
  for (const observation of manifest.observations) {
    requireThat(observation && goals.has(observation.objectiveId), 'unknown objectiveId');
    requireThat(!observedIds.has(observation.objectiveId), 'duplicate objectiveId');
    observedIds.add(observation.objectiveId);
    requireThat(['observed', 'not-observed', 'unknown'].includes(observation.benchmark), 'benchmark invalid');
    requireThat(['verified', 'missing', 'unknown'].includes(observation.ours), 'internal state invalid');
    const ext = references(observation.externalEvidenceRefs);
    const own = references(observation.internalEvidenceRefs);
    const verdict = observation.benchmark === 'observed' && observation.ours === 'missing' &&
      ext.length && own.length ? 'GAP_CANDIDATE' :
      observation.ours === 'verified' && own.length ? 'COVERAGE_CANDIDATE' : 'NEEDS_VERIFICATION';
    findings.push({ ...goals.get(observation.objectiveId), benchmark: observation.benchmark,
      ours: observation.ours, external: ext, internal: own, verdict });
  }
  for (const item of product.objectives) {
    if (!observedIds.has(item.id)) findings.push({ ...item, benchmark: 'unknown',
      ours: 'unknown', external: [], internal: [], verdict: 'NEEDS_VERIFICATION' });
  }
  const lines = [
    '# REA comparative audit — ' + safe(product.name), '',
    '- Source SHA: ' + sha,
    '- External target: ' + safe(manifest.target.name) + ' (' + safe(manifest.target.url) + ')',
    '- Authorization: ' + manifest.target.access,
    '- Passive capture: ' + safe(manifest.captureFile),
    '- Capture SHA-256: ' + captureSha,
    '- Review: PENDING_INDEPENDENT_REVIEW; NOT release evidence', '',
    'All gap/coverage verdicts are candidates, never proof that code works or is absent.', '',
    '| ID | Risk | Objective | External | Internal | Verdict |',
    '| --- | --- | --- | --- | --- | --- |'
  ];
  for (const item of findings) {
    lines.push('| ' + item.id + ' | ' + item.risk + ' | ' + safe(item.goal) + ' | ' +
      item.benchmark + ' | ' + item.ours + ' | ' + item.verdict + ' |');
  }
  lines.push('', '## Evidence and independent review');
  for (const item of findings) {
    lines.push('', '### ' + item.id + ' — ' + item.verdict,
      '- Acceptance: ' + safe(item.acceptance),
      '- External references: ' + (item.external.join(', ') || 'NOT PROVIDED'),
      '- Internal references: ' + (item.internal.join(', ') || 'NOT PROVIDED'),
      '- Owners: ' + item.owners.join(', '),
      '- Follow-up: ' + (item.verdict === 'GAP_CANDIDATE'
        ? 'Reproduce and review source/runtime, then open an independently scoped issue.'
        : 'Confirm source, actual flow, persistence and exact-SHA tests before promotion.'));
  }
  await writeFile(outFile, lines.join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  console.log('REA_AUDIT_REPORT_CREATED ' + outFile);
}
main().catch((error) => {
  console.error(error.message?.startsWith('REA_AUDIT_BLOCKED:') ? error.message :
    'REA_AUDIT_BLOCKED: ' + (error.code || error.message || 'unexpected error'));
  process.exitCode = 1;
});
