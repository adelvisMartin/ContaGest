import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.resolve(here, '..');
const nativeDir = path.join(wrapper, 'android');
if (fs.existsSync(path.join(nativeDir, 'gradlew')) || fs.existsSync(path.join(nativeDir, 'gradlew.bat'))) {
  console.log('Plataforma Android Capacitor ya inicializada.');
  process.exit(0);
}

console.log('Inicializando plataforma Android Capacitor...');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npx, ['cap', 'add', 'android'], { cwd:wrapper, stdio:'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
