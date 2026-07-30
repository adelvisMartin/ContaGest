import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const repositoryRoot = path.resolve(frontendRoot, '..');
const backendEntry = path.join(repositoryRoot, 'backend/src/app.ts');
const apiEntry = path.join(repositoryRoot, 'api/index.ts');

try {
  await access(backendEntry);
} catch {
  throw new Error(`No se encontró la entrada del backend en ${backendEntry}`);
}

await build({
  entryPoints: [backendEntry],
  outfile: apiEntry,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: false,
  legalComments: 'none',
  banner: {
    js: '// Generated during build from backend/src/app.ts. Do not edit the deployed artifact directly.'
  }
});

console.log(`[stage-backend] Backend integrado en ${apiEntry}`);
