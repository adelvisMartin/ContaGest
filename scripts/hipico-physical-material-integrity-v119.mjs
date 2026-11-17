import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/i;
const inside = (base, target) => {
  const relative = path.relative(base, target);
  return relative !== '' && relative !== '..' &&
    !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};

async function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}

/** #119/#839: re-hash source files of physical QA artifacts, never trust JSON digests alone. */
export async function validHipicoPhysicalMaterial(manifestFile, evidenceRows) {
  if (typeof manifestFile !== 'string' || !manifestFile.trim() ||
      !Array.isArray(evidenceRows) || evidenceRows.length === 0 ||
      evidenceRows.length > 10000) return false;
  try {
    const base = path.dirname(path.resolve(manifestFile));
    const realBase = await fsp.realpath(base);
    const verified = new Map();
    for (const row of evidenceRows) {
      const rel = row?.path;
      if (typeof rel !== 'string' || !rel.trim() || rel.includes('\0') ||
          path.isAbsolute(rel) || path.win32.isAbsolute(rel) ||
          rel.split(/[\\/]+/).includes('..') || !SHA256.test(String(row?.sha256 || ''))) return false;
      const absolute = path.resolve(base, rel);
      if (!inside(base, absolute)) return false;
      const stat = await fsp.lstat(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) return false;
      const real = await fsp.realpath(absolute);
      if (!inside(realBase, real)) return false;
      const declared = row.sha256.toLowerCase();
      if (verified.has(real)) {
        if (verified.get(real) !== declared) return false;
        continue;
      }
      const actual = await sha256File(real);
      if (actual !== declared) return false;
      verified.set(real, declared);
    }
    return true;
  } catch {
    return false;
  }
}
