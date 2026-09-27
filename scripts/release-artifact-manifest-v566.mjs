import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const candidateSha = String(process.env.CANDIDATE_SHA || process.env.GITHUB_SHA || process.env.GIT_COMMIT_SHA || '').trim();
if (!/^[a-f0-9]{40}$/i.test(candidateSha)) throw new Error('A full exact candidate SHA is required.');
const roots = ['frontend/dist', 'backend/dist'];
for (const root of roots) if (!fs.existsSync(root)) throw new Error(`Build artifact missing: ${root}`);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}
function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
const files = roots.flatMap((root) => walk(root)).map((file) => ({
  path: file.replaceAll('\\', '/'),
  bytes: fs.statSync(file).size,
  sha256: digest(file),
})).sort((a, b) => a.path.localeCompare(b.path));
const manifest = {
  schemaVersion: 1,
  candidateSha,
  generatedAt: new Date().toISOString(),
  files,
  artifactHash: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'),
};
fs.mkdirSync('artifacts/release', { recursive: true });
fs.writeFileSync('artifacts/release/artifact-manifest-v566.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`release artifact ${candidateSha} files=${files.length} hash=${manifest.artifactHash}`);
