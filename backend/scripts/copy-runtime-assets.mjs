import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, '..');
const assets = [
  {
    source: 'src/modules/verticals/care-clinical-write-policy.mjs',
    target: 'dist/src/modules/verticals/care-clinical-write-policy.mjs'
  },
  {
    source: 'src/shared/contracts/accessManifestRuntime.js',
    target: 'dist/src/shared/contracts/accessManifestRuntime.js'
  },
  {
    source: 'src/modules/crm/crm-domain.mjs',
    target: 'dist/src/modules/crm/crm-domain.mjs'
  },
  {
    source: 'src/modules/crm/client-match-preflight.mjs',
    target: 'dist/src/modules/crm/client-match-preflight.mjs'
  },
  {
    source: 'src/modules/crm/crm-lead-store.mjs',
    target: 'dist/src/modules/crm/crm-lead-store.mjs'
  },
  {
    source: 'src/modules/crm/crm-lead-stage.mjs',
    target: 'dist/src/modules/crm/crm-lead-stage.mjs'
  },
  {
    source: 'src/modules/crm/crm-opportunity-store.mjs',
    target: 'dist/src/modules/crm/crm-opportunity-store.mjs'
  },
  {
    source: 'src/modules/crm/crm-opportunity-stage.mjs',
    target: 'dist/src/modules/crm/crm-opportunity-stage.mjs'
  },
  {
    source: 'src/modules/crm/crm-forecast.mjs',
    target: 'dist/src/modules/crm/crm-forecast.mjs'
  }
];

for (const asset of assets) {
  const source = resolve(backendRoot, asset.source);
  const target = resolve(backendRoot, asset.target);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

console.log(`[backend-build] copied ${assets.length} runtime asset(s)`);
