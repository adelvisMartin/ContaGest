import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let lockfile = 'package-lock.json';
let check = false;
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--check') {
    check = true;
  } else if (arg === '--lockfile') {
    const value = args[i + 1];
    if (!value) throw new Error('LOCKFILE_PATH_REQUIRED');
    lockfile = value;
    i += 1;
  } else {
    throw new Error(`UNKNOWN_ARGUMENT:${arg}`);
  }
}

const target = path.resolve(lockfile);
const original = fs.readFileSync(target, 'utf8');
const lock = JSON.parse(original);
if (lock.lockfileVersion !== 3 || !lock.packages || typeof lock.packages !== 'object') {
  throw new Error('PACKAGE_LOCK_V3_REQUIRED');
}
if (!lock.packages.backend || typeof lock.packages.backend !== 'object') {
  throw new Error('BACKEND_WORKSPACE_LOCK_ENTRY_REQUIRED');
}

const retiredPaths = new Set([
  'backend/node_modules/exceljs',
  'node_modules/@excel.js/archiver',
  'node_modules/@excel.js/jszip',
  'node_modules/@excel.js/unzipper',
  'node_modules/es-pako',
]);

// These packages are descendants of the retired ExcelJS fork in the current lock.
// They may be removed only while no surviving package references their package name.
const orphanPaths = new Set([
  'backend/node_modules/@fast-csv/format',
  'backend/node_modules/@fast-csv/parse',
  'backend/node_modules/fast-csv',
  'backend/node_modules/saxes',
  'node_modules/dayjs',
  'node_modules/tmp',
  'node_modules/lodash.escaperegexp',
  'node_modules/lodash.groupby',
  'node_modules/lodash.uniq',
  'node_modules/xmlchars',
]);
const doomedPaths = new Set([...retiredPaths, ...orphanPaths]);

function packageNameFromLockPath(lockPath) {
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  return index === -1 ? null : lockPath.slice(index + marker.length);
}

const doomedNames = new Set([...doomedPaths].map(packageNameFromLockPath).filter(Boolean));
const dependencyFields = ['dependencies', 'optionalDependencies', 'peerDependencies'];

for (const [lockPath, metadata] of Object.entries(lock.packages)) {
  if (doomedPaths.has(lockPath) || !metadata || typeof metadata !== 'object') continue;
  for (const field of dependencyFields) {
    const dependencies = metadata[field];
    if (!dependencies || typeof dependencies !== 'object') continue;
    for (const dependencyName of Object.keys(dependencies)) {
      if (!doomedNames.has(dependencyName)) continue;
      // backend/package.json already removed ExcelJS; this stale lock edge is the one
      // authoritative manifest mismatch that this normalizer repairs.
      if (lockPath === 'backend' && field === 'dependencies' && dependencyName === 'exceljs') continue;
      throw new Error(`LOCK_NORMALIZATION_SHARED_DEPENDENCY:${dependencyName}:${lockPath}:${field}`);
    }
  }
}

if (lock.packages.backend.dependencies && typeof lock.packages.backend.dependencies === 'object') {
  delete lock.packages.backend.dependencies.exceljs;
}
for (const lockPath of doomedPaths) delete lock.packages[lockPath];

const normalized = `${JSON.stringify(lock, null, 2)}\n`;
if (check) {
  if (normalized !== original) {
    process.stderr.write('PACKAGE_LOCK_NORMALIZATION_REQUIRED\n');
    process.exitCode = 2;
  } else {
    process.stdout.write('package-lock.json already normalized for issue #26\n');
  }
} else {
  fs.writeFileSync(target, normalized);
  process.stdout.write(`normalized ${path.basename(target)}: removed ${doomedPaths.size} retired/orphan package entries\n`);
}
