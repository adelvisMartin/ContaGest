import fs from 'node:fs';

const baseUrl = String(process.env.SMOKE_BASE_URL || '').replace(/\/$/, '');
const expectedSha = String(process.env.CANDIDATE_SHA || process.env.GIT_COMMIT_SHA || '').trim();
if (!baseUrl) throw new Error('SMOKE_BASE_URL is required.');
if (!/^[a-f0-9]{40}$/i.test(expectedSha)) throw new Error('Exact CANDIDATE_SHA/GIT_COMMIT_SHA is required.');

async function readJson(path, init = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'error', ...init });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  return { path, status: response.status, elapsedMs: Number((performance.now() - startedAt).toFixed(3)), body };
}

const live = await readJson('/health/live');
const ready = await readJson('/health/ready');
const unknown = await readJson('/api/v1/__release-smoke-not-found__');
const checks = [
  { id: 'liveness', ok: live.status === 200 && live.body?.status === 'live' && live.body?.buildCommit === expectedSha, sample: live },
  { id: 'readiness', ok: ready.status === 200 && ready.body?.status === 'ready' && ready.body?.buildCommit === expectedSha, sample: ready },
  { id: 'safe-not-found', ok: unknown.status === 404 && unknown.body?.ok === false && typeof unknown.body?.requestId === 'string' && !('stack' in (unknown.body || {})), sample: unknown },
];
const report = { schemaVersion: 1, candidateSha: expectedSha, baseUrlOrigin: new URL(baseUrl).origin, capturedAt: new Date().toISOString(), checks, ok: checks.every((check) => check.ok) };
fs.mkdirSync('artifacts/release', { recursive: true });
fs.writeFileSync('artifacts/release/smoke-v566.json', `${JSON.stringify(report, null, 2)}\n`);
for (const check of checks) console.log(`${check.id}: ${check.ok ? 'PASS' : 'FAIL'} status=${check.sample.status}`);
if (!report.ok) process.exitCode = 1;
