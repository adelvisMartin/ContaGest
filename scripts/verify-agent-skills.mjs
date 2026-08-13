import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const lock = JSON.parse(await fs.readFile(path.join(root, 'agent-skills.lock.json'), 'utf8'));
const errors = [];
const ids = new Set();

if (lock.schemaVersion !== 1) errors.push('Unsupported agent-skills.lock.json schemaVersion');
if (lock.policy?.updateMode !== 'pinned-only') errors.push('updateMode must be pinned-only');
if (lock.policy?.executeUpstreamScripts !== false) errors.push('executeUpstreamScripts must be false');

for (const source of lock.sources || []) {
  if (!source.id || ids.has(source.id)) errors.push(`Duplicate/missing source id: ${source.id || '<empty>'}`);
  ids.add(source.id);
  if (!/^[0-9a-f]{40}$/i.test(source.commit || '')) errors.push(`${source.id}: commit must be a full 40-char SHA`);
  if (!source.license) errors.push(`${source.id}: license metadata missing`);
  for (const rel of source.vendorPaths || []) {
    const normalized = path.posix.normalize(String(rel).replaceAll('\\', '/'));
    if (normalized.startsWith('../') || normalized.includes('/../') || path.posix.isAbsolute(normalized)) errors.push(`${source.id}: unsafe path ${rel}`);
  }
}

const vendorRoot = path.join(root, lock.policy?.vendorDirectory || '.agents/vendor');
try {
  const manifest = JSON.parse(await fs.readFile(path.join(vendorRoot, 'manifest.json'), 'utf8'));
  for (const item of manifest.files || []) {
    const file = path.join(vendorRoot, item.source, item.path);
    const bytes = await fs.readFile(file);
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actual !== item.sha256) errors.push(`Integrity mismatch: ${item.source}/${item.path}`);
  }
  console.log(`Verified ${manifest.files?.length || 0} vendored skill files`);
} catch (error) {
  if (error?.code === 'ENOENT') console.log('Vendor cache not present; lockfile policy validation only. Run npm run skills:sync to materialize pinned sources.');
  else errors.push(`Vendor manifest error: ${error.message}`);
}

if (errors.length) {
  console.error(errors.map((value) => `- ${value}`).join('\n'));
  process.exit(1);
}
console.log(`Validated ${ids.size} pinned agent/MCP sources`);
