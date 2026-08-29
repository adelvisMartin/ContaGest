import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.resolve(here, '..');
const repo = path.resolve(wrapper, '../..');
const policy = JSON.parse(fs.readFileSync(path.join(repo, 'products/hipico-control/release-policy.json'), 'utf8'));
const candidates = [
  path.join(wrapper, 'android/app/build.gradle'),
  path.join(wrapper, 'android/app/build.gradle.kts')
];
const gradleFile = candidates.find((candidate) => fs.existsSync(candidate));
if (!gradleFile) throw new Error('No existe android/app/build.gradle(.kts). Ejecuta ensure-android primero.');

let source = fs.readFileSync(gradleFile, 'utf8');
const original = source;
const groovy = gradleFile.endsWith('.gradle');

if (groovy) {
  source = source.replace(/\bversionCode\s+\d+\b/, `versionCode ${policy.versionCode}`);
  source = source.replace(/\bversionName\s+["'][^"']+["']/, `versionName "${policy.version}"`);
} else {
  source = source.replace(/\bversionCode\s*=\s*\d+\b/, `versionCode = ${policy.versionCode}`);
  source = source.replace(/\bversionName\s*=\s*["'][^"']+["']/, `versionName = "${policy.version}"`);
}

if (source === original || !source.includes(String(policy.versionCode)) || !source.includes(policy.version)) {
  throw new Error(`No se pudo fijar versionCode/versionName en ${gradleFile}`);
}

fs.writeFileSync(gradleFile, source, 'utf8');
console.log(`Android release metadata: versionName=${policy.version} versionCode=${policy.versionCode}`);
