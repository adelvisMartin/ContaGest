import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const lockPath = path.join(root, 'agent-skills.lock.json');
const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'));
const vendorRoot = path.join(root, lock.policy?.vendorDirectory || '.agents/vendor');

if (lock.policy?.updateMode !== 'pinned-only') throw new Error('Refusing unpinned skill update mode');
if (lock.policy?.executeUpstreamScripts !== false) throw new Error('Upstream script execution must remain disabled');

const manifest = { schemaVersion: 1, generatedAt: new Date().toISOString(), files: [] };

function safeRelative(input) {
  const normalized = path.posix.normalize(String(input).replaceAll('\\', '/'));
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../') || path.posix.isAbsolute(normalized)) {
    throw new Error(`Unsafe vendor path: ${input}`);
  }
  return normalized;
}

for (const source of lock.sources || []) {
  if (source.kind !== 'github-skill') continue;
  if (!/^[0-9a-f]{40}$/i.test(source.commit || '')) throw new Error(`Source ${source.id} is not pinned to a full commit SHA`);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repo || '')) throw new Error(`Invalid GitHub repo for ${source.id}`);

  for (const requestedPath of source.vendorPaths || []) {
    const rel = safeRelative(requestedPath);
    const rawUrl = `https://raw.githubusercontent.com/${source.repo}/${source.commit}/${rel}`;
    const response = await fetch(rawUrl, { redirect: 'error', headers: { 'user-agent': 'ContaGest-skill-sync/1' } });
    if (!response.ok) throw new Error(`Failed ${source.id}:${rel} (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 1_500_000) throw new Error(`Refusing oversized skill file: ${source.id}:${rel}`);

    const output = path.join(vendorRoot, safeRelative(source.id), rel);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, bytes);
    manifest.files.push({ source: source.id, repo: source.repo, commit: source.commit, path: rel, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
}

await fs.mkdir(vendorRoot, { recursive: true });
await fs.writeFile(path.join(vendorRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Synced ${manifest.files.length} pinned skill files into ${path.relative(root, vendorRoot)}`);
