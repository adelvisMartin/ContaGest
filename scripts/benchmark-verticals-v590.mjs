import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const sha = String(process.env.CANDIDATE_SHA || process.env.GITHUB_SHA || '').trim();
if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
const out = 'artifacts/qa/benchmark-v590';
fs.mkdirSync(out, { recursive: true });

const commands = [
  ['node', ['--test', 'tests/benchmark_verticals_v590_contract.test.mjs'], 'source-contract'],
  ['npm', ['--workspace', 'backend', 'exec', '--', 'tsx', '--test', '../qa/verticals-backend-real-v4851.test.ts'], 'postgres-lifecycle'],
  ['npx', ['playwright', 'test', 'qa/benchmark-verticals-v590.spec.mjs', '--project=chromium', '--workers=1'], 'browser-responsive-rbac'],
  ['npx', ['playwright', 'test', 'qa/module-actions-runtime-v163.spec.mjs', '--project=chromium', '--workers=1'], 'browser-actions'],
];
const results = [];
for (const [cmd, args, id] of commands) {
  const child = spawnSync(cmd, args, { env: { ...process.env, CANDIDATE_SHA: sha }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const row = { id, command: [cmd, ...args], status: child.status, signal: child.signal || null, completedAt: new Date().toISOString() };
  results.push(row);
  fs.writeFileSync(`${out}/${id}.stdout.log`, child.stdout || '');
  fs.writeFileSync(`${out}/${id}.stderr.log`, child.stderr || '');
  if (child.status !== 0) {
    fs.writeFileSync(`${out}/summary.json`, `${JSON.stringify({ ticket: '#590', candidateSha: sha, ok: false, results }, null, 2)}\n`);
    process.exit(child.status ?? 1);
  }
}
fs.writeFileSync(`${out}/summary.json`, `${JSON.stringify({ ticket: '#590', candidateSha: sha, ok: true, syntheticOnly: true, results }, null, 2)}\n`);
