import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireApk = process.argv.includes('--require-apk');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const readJson = (relative) => JSON.parse(read(relative));

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function filesUnder(directory) {
  const output = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) output.push(absolute);
    }
  };
  visit(directory);
  return output.sort();
}

function assert(condition, message) {
  if (!condition) throw new Error(`RELEASE_BLOCKED: ${message}`);
}

function extract(pattern, source, label) {
  const match = source.match(pattern);
  assert(match?.[1], `no se pudo leer ${label}`);
  return match[1];
}

const policy = readJson('products/hipico-control/release-policy.json');
const buildInfo = readJson('frontend/public/hipico-control/build-info.json');
const androidPackage = readJson('android/hipico-control-v1130/package.json');
const capacitor = readJson('android/hipico-control-v1130/capacitor.config.json');
const configSource = read('frontend/public/hipico-control/assets/js/config.js');
const indexSource = read('frontend/public/hipico-control/index.html');
const serviceWorkerSource = read('frontend/public/hipico-control/sw.js');
const workspaceSource = read('frontend/public/hipico-control/assets/js/workspace.js');

const appVersion = extract(/APP_VERSION\s*=\s*["']([^"']+)["']/, configSource, 'APP_VERSION');
const htmlVersion = extract(/name=["']application-version["'][^>]*content=["']([^"']+)["']|content=["']([^"']+)["'][^>]*name=["']application-version["']/, indexSource, 'meta application-version');
const resolvedHtmlVersion = htmlVersion || indexSource.match(/content=["']([^"']+)["'][^>]*name=["']application-version["']/)?.[1];
const cacheVersion = extract(/CACHE_VERSION\s*=\s*["']hipico-control-v([^"']+)["']/, serviceWorkerSource, 'CACHE_VERSION');
const workspaceSchema = Number(extract(/workspace\.schemaVersion\s*=\s*(\d+)/, workspaceSource, 'workspace schema'));

assert(policy.product === 'control-hipico', 'product id inválido');
assert(policy.allowedChannels?.includes(policy.channel), `channel ${policy.channel} no está permitido`);
assert(Number.isInteger(policy.versionCode) && policy.versionCode > 0, 'versionCode debe ser entero positivo');
assert(policy.version === buildInfo.version, `build-info ${buildInfo.version} != policy ${policy.version}`);
assert(policy.version === androidPackage.version, `Android package ${androidPackage.version} != policy ${policy.version}`);
assert(policy.version === appVersion, `APP_VERSION ${appVersion} != policy ${policy.version}`);
assert(policy.version === resolvedHtmlVersion, `HTML application-version ${resolvedHtmlVersion} != policy ${policy.version}`);
assert(policy.version === cacheVersion, `Service Worker ${cacheVersion} != policy ${policy.version}`);
assert(policy.workspaceSchema === workspaceSchema, `workspace schema ${workspaceSchema} != policy ${policy.workspaceSchema}`);
assert(policy.androidApplicationId === capacitor.appId, `appId ${capacitor.appId} != policy ${policy.androidApplicationId}`);
assert(policy.signing?.release === 'external-secret-only', 'la política release debe mantener signing fuera del repo');
assert(policy.promotion?.requiresP0Green === true, 'P0 green debe ser obligatorio');
assert(policy.promotion?.requiresPhysicalQa === true, 'QA físico debe ser obligatorio');
assert(policy.promotion?.requiresExplicitApproval === true, 'promoción requiere aprobación explícita');

const candidateSha = String(process.env.HIPICO_RELEASE_SHA || process.env.GITHUB_SHA || git(['rev-parse', 'HEAD'], 'unknown-sha')).trim();
const branch = String(process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git(['branch', '--show-current'], 'unknown-branch')).trim();
const dirty = Boolean(git(['status', '--porcelain'], ''));
const runtimeRoot = path.join(root, 'frontend/public/hipico-control');
const runtimeFiles = filesUnder(runtimeRoot);
const runtimeHashes = runtimeFiles.map((file) => ({
  path: path.relative(root, file).replaceAll('\\', '/'),
  sha256: sha256File(file),
  bytes: fs.statSync(file).size
}));

const androidArtifact = path.join(root, 'android/hipico-control-v1130/artifacts', `Hipico-Control-v${policy.version}-debug.apk`);
let apk = { state: 'NOT_EXECUTED', file: path.relative(root, androidArtifact).replaceAll('\\', '/') };
if (fs.existsSync(androidArtifact) && fs.statSync(androidArtifact).size > 0) {
  apk = {
    state: 'PASS',
    file: path.relative(root, androidArtifact).replaceAll('\\', '/'),
    sha256: sha256File(androidArtifact),
    bytes: fs.statSync(androidArtifact).size
  };
} else if (requireApk) {
  throw new Error(`RELEASE_BLOCKED: falta APK esperado ${androidArtifact}`);
}

const outputDir = path.join(root, 'artifacts/qa/hipico-v118', candidateSha);
fs.mkdirSync(outputDir, { recursive: true });
const manifest = {
  schema: 'hipico-release-evidence.v1',
  generatedAt: new Date().toISOString(),
  candidateSha,
  branch,
  dirty,
  status: 'PASS',
  release: {
    product: policy.product,
    version: policy.version,
    versionCode: policy.versionCode,
    channel: policy.channel,
    workspaceSchema: policy.workspaceSchema,
    parserContract: policy.parserContract,
    androidApplicationId: policy.androidApplicationId
  },
  contracts: {
    buildInfoVersion: buildInfo.version,
    appVersion,
    htmlVersion: resolvedHtmlVersion,
    serviceWorkerVersion: cacheVersion,
    androidPackageVersion: androidPackage.version,
    workspaceSchema,
    signingPolicy: policy.signing,
    promotion: policy.promotion
  },
  pwa: {
    state: 'PASS',
    root: 'frontend/public/hipico-control',
    files: runtimeHashes
  },
  android: {
    wrapperParity: 'REQUIRES_SYNC_WEB_GATE',
    artifact: apk,
    releaseSigning: 'NOT_EXECUTED'
  },
  boundaries: {
    installUpgradeDowngrade: 'REQUIRES_PHYSICAL_QA',
    rollback: 'REQUIRES_DRILL',
    storePublication: 'OUT_OF_SCOPE'
  }
};

fs.writeFileSync(path.join(outputDir, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
fs.writeFileSync(
  path.join(outputDir, 'SHA256SUMS.txt'),
  `${runtimeHashes.map((item) => `${item.sha256}  ${item.path}`).join('\n')}${apk.sha256 ? `\n${apk.sha256}  ${apk.file}` : ''}\n`,
  'utf8'
);

console.log(`HIPICO_RELEASE_GATE PASS version=${policy.version} versionCode=${policy.versionCode} sha=${candidateSha}`);
console.log(`EVIDENCE ${path.relative(root, outputDir).replaceAll('\\', '/')}`);
console.log(`APK ${apk.state}`);
