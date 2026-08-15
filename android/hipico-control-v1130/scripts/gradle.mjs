import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.resolve(here, '..');
const nativeDir = path.join(wrapper, 'android');
const task = process.argv[2];
if (!task) throw new Error('Falta la tarea Gradle (assembleDebug, bundleRelease, etc.).');
const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const gradlePath = path.join(nativeDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
if (!fs.existsSync(gradlePath)) throw new Error('Android no está inicializado. Ejecuta npm run android:init.');
const result = spawnSync(gradle, [task], { cwd:nativeDir, stdio:'inherit', shell:process.platform === 'win32' });
process.exit(result.status || 0);
