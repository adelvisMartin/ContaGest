import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.env.HIPICO_EVIDENCE_ROOT || 'artifacts/upstream');
const sha = String(process.env.HIPICO_RELEASE_SHA || process.env.GITHUB_SHA || '').trim();
const event = String(process.env.HIPICO_RELEASE_EVENT || process.env.GITHUB_EVENT_NAME || 'unknown');
if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('HIPICO_EVIDENCE_SHA_REQUIRED');

async function walk(directory, output = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute, output);
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

const files = await walk(root).catch(() => []);
const byName = new Map();
for (const file of files) {
  const name = path.basename(file);
  const list = byName.get(name) || [];
  list.push(file);
  byName.set(name, list);
}

async function requireJson(name, expected = {}) {
  const candidates = byName.get(name) || [];
  if (!candidates.length) throw new Error(`HIPICO_EVIDENCE_MISSING:${name}`);
  let matched = null;
  for (const file of candidates) {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (String(data.sha || '') !== sha) continue;
    if (data.status && data.status !== 'PASS') continue;
    let ok = true;
    for (const [key, value] of Object.entries(expected)) if (data[key] !== value) ok = false;
    if (ok) { matched = { file, data }; break; }
  }
  if (!matched) throw new Error(`HIPICO_EVIDENCE_SHA_OR_STATUS_MISMATCH:${name}`);
  return { name, file: path.relative(root, matched.file), schema: matched.data.schema || null };
}

const verified = [];
if (event === 'schedule') {
  verified.push(await requireJson('browser-chromium.json', { project: 'chromium' }));
  verified.push(await requireJson('browser-firefox.json', { project: 'firefox' }));
  verified.push(await requireJson('browser-webkit.json', { project: 'webkit' }));
} else {
  verified.push(await requireJson('static-gate.json'));
  verified.push(await requireJson('postgres-gate.json'));
  verified.push(await requireJson('chromium-gate.json', { project: 'chromium' }));
  verified.push(await requireJson('security-gate.json'));
  verified.push(await requireJson('android-gate.json'));
  if (event === 'workflow_dispatch') {
    verified.push(await requireJson('browser-chromium.json', { project: 'chromium' }));
    verified.push(await requireJson('browser-firefox.json', { project: 'firefox' }));
    verified.push(await requireJson('browser-webkit.json', { project: 'webkit' }));
  }
}

const outputDir = path.resolve('artifacts/qa/hipico-v290');
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'evidence-verification.json'), `${JSON.stringify({
  schema: 'hipico-evidence-verification.v290',
  sha,
  event,
  status: 'PASS',
  verifiedAt: new Date().toISOString(),
  verified
}, null, 2)}\n`, 'utf8');
console.log(`[hipico-v290] verified ${verified.length} SHA-bound gate artifacts for ${sha}`);
