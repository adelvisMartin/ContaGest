import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.resolve(here, '..');
const inputApk = path.join(wrapper, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const outDir = path.join(wrapper, 'artifacts');
const version = JSON.parse(fs.readFileSync(path.join(wrapper, 'package.json'), 'utf8')).version;
const outputApk = path.join(outDir, `Hipico-Control-v${version}-debug.apk`);

if (!fs.existsSync(inputApk) || fs.statSync(inputApk).size === 0) {
  throw new Error(`APK debug no encontrado: ${inputApk}`);
}
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(inputApk, outputApk);
const bytes = fs.readFileSync(outputApk);
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

function sdkTool(name) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) return null;
  const buildTools = path.join(sdk, 'build-tools');
  if (!fs.existsSync(buildTools)) return null;
  const versions = fs.readdirSync(buildTools).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const suffix = process.platform === 'win32' ? '.bat' : '';
  for (const versionDir of versions) {
    const candidate = path.join(buildTools, versionDir, `${name}${suffix}`);
    if (fs.existsSync(candidate)) return candidate;
    const exe = path.join(buildTools, versionDir, `${name}.exe`);
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

const checks = { apkExists: true, sha256, size: bytes.length, apksigner: 'NOT_EXECUTED', badging: 'NOT_EXECUTED' };
const apksigner = sdkTool('apksigner');
if (apksigner) {
  const result = spawnSync(apksigner, ['verify', '--verbose', outputApk], { encoding: 'utf8', shell: false });
  checks.apksigner = result.status === 0 ? 'PASS' : 'FAIL';
  if (result.status !== 0) throw new Error(`apksigner verify falló: ${result.stderr || result.stdout}`);
}
const aapt = sdkTool('aapt');
if (aapt) {
  const result = spawnSync(aapt, ['dump', 'badging', outputApk], { encoding: 'utf8', shell: false });
  checks.badging = result.status === 0 ? 'PASS' : 'FAIL';
  if (result.status === 0) fs.writeFileSync(path.join(outDir, 'APK_BADGING.txt'), result.stdout, 'utf8');
}

fs.writeFileSync(path.join(outDir, 'SHA256SUMS.txt'), `${sha256}  ${path.basename(outputApk)}\n`, 'utf8');
fs.writeFileSync(path.join(outDir, 'QA_APK_METADATA.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  version,
  file: path.basename(outputApk),
  ...checks
}, null, 2));
console.log(`APK_QA_READY ${outputApk}`);
console.log(`SHA256 ${sha256}`);
