import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

if (lock.name !== pkg.name || lock.packages?.['']?.name !== pkg.name) {
  throw new Error(`HIPICO_ANDROID_LOCK_NAME_MISMATCH package=${pkg.name} lock=${lock.name}/${lock.packages?.['']?.name}`);
}
if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) {
  throw new Error(`HIPICO_ANDROID_LOCK_VERSION_MISMATCH package=${pkg.version} lock=${lock.version}/${lock.packages?.['']?.version}`);
}
console.log(`HIPICO_ANDROID_RELEASE_METADATA PASS ${pkg.version}`);
