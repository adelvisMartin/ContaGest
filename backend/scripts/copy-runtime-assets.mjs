import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, '..');
const assets = [
  {
    source: 'src/shared/contracts/accessManifestRuntime.js',
    target: 'dist/src/shared/contracts/accessManifestRuntime.js'
  }
];

for (const asset of assets) {
  const source = resolve(backendRoot, asset.source);
  const target = resolve(backendRoot, asset.target);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

console.log(`[backend-build] copied ${assets.length} runtime asset(s)`);
