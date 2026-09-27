import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repoRoot = process.cwd();
const modulesRoot = path.join(repoRoot, 'backend/src/modules');
const routeManifestPath = path.join(modulesRoot, 'route-manifest.ts');
const appPath = path.join(repoRoot, 'backend/src/app.ts');
const contractPath = path.join(repoRoot, 'backend/src/shared/contracts/api-contract-v1.json');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function normalizeSource(absolute) {
  return path.relative(repoRoot, absolute).replaceAll('\\', '/');
}

function literalRouterOperations(source, absolute) {
  const operations = [];
  const regex = /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  for (const match of source.matchAll(regex)) {
    operations.push({ method: match[1].toUpperCase(), relativePath: match[2], source: normalizeSource(absolute) });
  }
  return operations;
}

const routeFiles = walk(modulesRoot).filter((file) => file.endsWith('.routes.ts'));
const operations = routeFiles.flatMap((file) => literalRouterOperations(fs.readFileSync(file, 'utf8'), file));

const crudSource = fs.readFileSync(path.join(modulesRoot, 'crud.factory.ts'), 'utf8');
for (const [method, relativePath] of [['GET', '/'], ['GET', '/:id'], ['POST', '/'], ['PUT', '/:id'], ['DELETE', '/:id']]) {
  operations.push({ method, relativePath, source: 'backend/src/modules/crud.factory.ts', generatedCrud: true });
}

const manifestSource = fs.readFileSync(routeManifestPath, 'utf8');
const manifestMounts = [...manifestSource.matchAll(/\{\s*id:\s*'([^']+)'\s*,\s*domain:\s*'([^']+)'\s*,\s*path:\s*'([^']+)'/g)]
  .map((match) => ({ id: match[1], domain: match[2], mount: `/api/v1${match[3]}`, source: 'backend/src/modules/route-manifest.ts' }));

const appSource = fs.readFileSync(appPath, 'utf8');
const appMounts = [...appSource.matchAll(/app\.(?:use|post)\(\s*['"`]([^'"`]+)['"`]/g)]
  .map((match) => ({ mount: match[1], source: 'backend/src/app.ts' }))
  .filter((entry) => entry.mount.startsWith('/api/'));

const policy = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const normalized = {
  schemaVersion: 1,
  apiVersion: policy.apiVersion,
  candidateSha: process.env.CANDIDATE_SHA || process.env.GITHUB_SHA || 'unknown',
  generatedAt: new Date().toISOString(),
  mounts: [...manifestMounts, ...appMounts].sort((a, b) => a.mount.localeCompare(b.mount)),
  operations: operations.sort((a, b) => `${a.source}:${a.relativePath}:${a.method}`.localeCompare(`${b.source}:${b.relativePath}:${b.method}`)),
};
normalized.fingerprint = crypto.createHash('sha256').update(JSON.stringify({ mounts: normalized.mounts, operations: normalized.operations })).digest('hex');

if (!normalized.mounts.length || !normalized.operations.length) throw new Error('API inventory is empty; runtime/source scan failed closed.');
if (!normalized.mounts.some((entry) => entry.mount === '/api/v1/hipico')) throw new Error('Canonical /api/v1/hipico mount is missing.');
if (!normalized.mounts.some((entry) => entry.mount === '/api/v1')) throw new Error('Canonical /api/v1 module mount is missing.');

const outputDir = path.resolve('artifacts/contracts');
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, 'api-inventory-v565.json');
fs.writeFileSync(outputPath, `${JSON.stringify(normalized, null, 2)}\n`);
console.log(`API inventory: ${normalized.operations.length} operations, ${normalized.mounts.length} mounts, fingerprint=${normalized.fingerprint}`);
