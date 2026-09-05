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

// Vercel installs the monorepo workspaces, but its serverless tracer only guarantees
// top-level runtime packages that remain explicit externals in the generated API.
// `exceljs` is intentionally NOT externalized: it is an npm alias installed below
// backend/node_modules and was missing from /var/task/frontend at runtime, causing
// every API route (including /auth/captcha) to crash during module linking.
// Bundling that package and its dependency graph keeps XLSX support available without
// duplicating the alias in the frontend workspace or weakening the locked dependency tree.
const EXTERNAL_RUNTIME_PACKAGES = [
  '@prisma/client',
  '@supabase/supabase-js',
  'bcryptjs',
  'bwip-js',
  'cors',
  'dotenv',
  'express',
  'express-rate-limit',
  'helmet',
  'jsonwebtoken',
  'morgan',
  'pdfkit',
  'pg',
  'pino',
  'prisma',
  'qrcode',
  'zod'
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
  external: EXTERNAL_RUNTIME_PACKAGES,
  sourcemap: false,
  legalComments: 'none',
  write: false,
  banner: {
    js: '// Generated during build from backend/src/app.ts. Do not edit the deployed artifact directly.'
  }
});

const bundledApi = result.outputFiles?.[0]?.contents;
if (!bundledApi) throw new Error('esbuild no generó el bundle de la API.');

const generatedText = Buffer.from(bundledApi).toString('utf8');
if (/\bfrom\s+["']exceljs["']|\bimport\(["']exceljs["']\)/.test(generatedText)) {
  throw new Error('[stage-backend] exceljs quedó externalizado; el artifact serverless volvería a fallar en runtime.');
}

await Promise.all(apiEntries.map((entry) => writeFile(entry, bundledApi)));
console.log(`[stage-backend] Backend integrado en ${apiEntries.join(' y ')}; exceljs incluido en el artifact serverless.`);
