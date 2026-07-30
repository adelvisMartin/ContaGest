import { access, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const backendSource = path.resolve(frontendRoot, '../backend/src');
const stagedRoot = path.resolve(frontendRoot, 'server-backend');
const stagedSource = path.join(stagedRoot, 'src');

try {
  await access(backendSource);
} catch {
  throw new Error(`No se encontró el backend fuente en ${backendSource}`);
}

await rm(stagedRoot, { recursive: true, force: true });
await mkdir(stagedRoot, { recursive: true });
await cp(backendSource, stagedSource, { recursive: true });

console.log(`[stage-backend] Backend copiado a ${stagedSource}`);
