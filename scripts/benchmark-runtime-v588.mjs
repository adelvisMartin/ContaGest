import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const sha = String(process.env.CANDIDATE_SHA || process.env.GITHUB_SHA || '').trim();
if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
const out = 'artifacts/qa/benchmark-v588';
fs.mkdirSync(out, { recursive: true });

const commands = [
  ['node', ['--test', 'tests/benchmark_runtime_v588_contract.test.mjs'], 'source-contract'],
  ['npm', ['--workspace', 'backend', 'exec', '--', 'tsx', '--test', 'src/modules/hipico-bot/hipico-autonomous-runtime.test.ts', 'src/modules/hipico-bot/hipico-autonomous-source-reply.test.ts'], 'hipico-autonomy'],
  ['npx', ['playwright', 'test', 'qa/benchmark-runtime-v588.spec.mjs', '--project=chromium', '--workers=1'], 'browser-critical'],
  ['npx', ['playwright', 'test', 'qa/accessibility-wcag22-v99.spec.mjs', '--project=chromium', '--workers=1'], 'a11y-chromium'],
];

const results = [];
for (const [command, args, id] of commands) {
  const startedAt = new Date().toISOString();
  const child = spawnSync(command, args, { cwd: process.cwd(), env: { ...process.env, CANDIDATE_SHA: sha }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const record = { id, command: [command, ...args], startedAt, completedAt: new Date().toISOString(), status: child.status, signal: child.signal || null };
  results.push(record);
  fs.writeFileSync(`${out}/${id}.stdout.log`, child.stdout || '');
  fs.writeFileSync(`${out}/${id}.stderr.log`, child.stderr || '');
  if (child.status !== 0) {
    fs.writeFileSync(`${out}/summary.json`, `${JSON.stringify({ ticket: '#588', candidateSha: sha, ok: false, results }, null, 2)}\n`);
    process.exit(child.status ?? 1);
  }
}
fs.writeFileSync(`${out}/summary.json`, `${JSON.stringify({ ticket: '#588', candidateSha: sha, ok: true, syntheticOnly: true, results }, null, 2)}\n`);
