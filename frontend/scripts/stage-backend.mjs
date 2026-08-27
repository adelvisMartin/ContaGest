import { access, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const repositoryRoot = path.resolve(frontendRoot, '..');
const backendRoot = path.join(repositoryRoot, 'backend');
const backendEntry = path.join(backendRoot, 'src/app.ts');
const backendRuntime = path.join(backendRoot, 'vercel-runtime.generated.mjs');
const apiEntries = [
  {
    path: path.join(repositoryRoot, 'api/index.js'),
    importPath: '../backend/vercel-runtime.generated.mjs'
  },
  {
    path: path.join(frontendRoot, 'api/index.js'),
    importPath: '../../backend/vercel-runtime.generated.mjs'
  }
];
const backendRequire = createRequire(path.join(backendRoot, 'package.json'));

try {
  await access(backendEntry);
} catch {
  throw new Error(`No se encontró la entrada del backend en ${backendEntry}`);
}

const result = await build({
  entryPoints: [backendEntry],
  outfile: backendRuntime,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: false,
  legalComments: 'none',
  metafile: true,
  write: false,
  banner: {
    js: '// Generated during build from backend/src/app.ts. Do not edit the deployed artifact directly.'
  }
});

const bundledApi = result.outputFiles?.[0]?.contents;
if (!bundledApi) throw new Error('esbuild no generó el bundle de la API.');

const externalImports = new Set();
for (const output of Object.values(result.metafile?.outputs || {})) {
  for (const item of output.imports || []) {
    if (item.external && !item.path.startsWith('node:')) externalImports.add(item.path);
  }
}
for (const specifier of externalImports) {
  try {
    backendRequire.resolve(specifier);
  } catch {
    throw new Error(`Dependencia runtime externa no resoluble desde backend: ${specifier}`);
  }
}

await writeFile(backendRuntime, bundledApi);
await Promise.all(apiEntries.map(({ path: entry, importPath }) => writeFile(
  entry,
  `// Generated during build. Keep external backend packages resolving from backend/package.json.\nexport { default } from '${importPath}';\n`
)));

console.log(`[stage-backend] Runtime generado en ${backendRuntime}`);
console.log(`[stage-backend] Wrappers integrados en ${apiEntries.map(({ path: entry }) => entry).join(' y ')}`);
console.log(`[stage-backend] Dependencias externas verificadas: ${externalImports.size}`);
