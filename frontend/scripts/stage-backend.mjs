import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const repositoryRoot = path.resolve(frontendRoot, '..');
const backendEntry = path.join(repositoryRoot, 'backend/src/app.ts');
const apiEntries = [
  path.join(repositoryRoot, 'api/index.js'),
  path.join(frontendRoot, 'api/index.js')
];

try {
  await access(backendEntry);
} catch {
  throw new Error(`No se encontró la entrada del backend en ${backendEntry}`);
}

const result = await build({
  entryPoints: [backendEntry],
  outfile: path.join(repositoryRoot, '.generated-api-index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: false,
  legalComments: 'none',
  write: false,
  banner: {
    js: '// Generated during build from backend/src/app.ts. Do not edit the deployed artifact directly.'
  }
});

const bundledApi = result.outputFiles?.[0]?.contents;
if (!bundledApi) throw new Error('esbuild no generó el bundle de la API.');

await Promise.all(apiEntries.map((entry) => writeFile(entry, bundledApi)));
console.log(`[stage-backend] Backend integrado en ${apiEntries.join(' y ')}`);
