import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.resolve(here, '..');
const repo = path.resolve(wrapper, '../..');
const restore = path.join(repo, 'scripts/restore-hipico-runtime.mjs');
const source = path.join(repo, 'frontend/public/hipico-control');
const target = path.join(wrapper, 'www');

const restored = spawnSync(process.execPath, [restore], { cwd:repo, stdio:'inherit' });
if (restored.status !== 0) process.exit(restored.status || 1);
if (!fs.existsSync(source)) throw new Error(`No existe ${source}.`);

const buildInfo = JSON.parse(fs.readFileSync(path.join(source, 'build-info.json'), 'utf8'));
if (buildInfo.version !== '1.13.0-parity.1') {
  throw new Error(`Runtime web Hípico no corresponde a RC1 parity: ${buildInfo.version || 'sin versión'}`);
}

fs.rmSync(target, { recursive:true, force:true });
fs.cpSync(source, target, { recursive:true });
console.log(`Control Hípico ${buildInfo.version} sincronizado: ${source} -> ${target}`);
