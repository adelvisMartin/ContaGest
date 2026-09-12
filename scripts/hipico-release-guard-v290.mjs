import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const assert = (condition, message) => { if (!condition) throw new Error(`HIPICO_V290_RELEASE_BLOCKED: ${message}`); };

const policy = json('products/hipico-control/release-policy.json');
const buildInfo = json('frontend/public/hipico-control/build-info.json');
const androidPackage = json('android/hipico-control-v1130/package.json');
const bridgePackage = json('tools/hipico-whatsapp-web-bridge/package.json');
const rootPackage = json('package.json');
const domain = read('backend/src/modules/hipico/hipico-domain.ts');
const index = read('frontend/public/hipico-control/index.html');
const serviceWorker = read('frontend/public/hipico-control/sw.js');
const workflowPath = '.github/workflows/hipico-production-gates-v290.yml';
const guarded = [
  'qa/hipico-production-v290.spec.mjs',
  'qa/hipico-command-center-v289.spec.mjs',
  'backend/src/modules/hipico/production-e2e-v290.ts',
  'backend/scripts/hipico-restart-recovery-v290.ts',
  'backend/scripts/hipico-load-profile-v290.ts',
  'tests/hipico_command_center_issue_289.test.mjs',
  'tests/hipico_production_security_issue_290.test.mjs',
  'scripts/hipico-apply-e2e-schema-v290.mjs',
  'scripts/hipico-release-report-v290.mjs',
  'scripts/hipico-verify-evidence-v290.mjs',
  workflowPath
];

execFileSync(process.execPath, ['scripts/hipico-release-v118.mjs'], { cwd: root, stdio: 'inherit', env: process.env });
const apiVersion = domain.match(/HIPICO_API_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
const bridgeProtocolVersion = domain.match(/HIPICO_BRIDGE_PROTOCOL_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
assert(apiVersion === policy.apiVersion, `backend API ${apiVersion || 'unknown'} != release policy ${policy.apiVersion}`);
assert(bridgeProtocolVersion === policy.bridgeProtocolVersion, `bridge protocol ${bridgeProtocolVersion || 'unknown'} != release policy ${policy.bridgeProtocolVersion}`);
assert(bridgePackage.version === policy.bridgePackageVersion, `bridge package ${bridgePackage.version} != release policy ${policy.bridgePackageVersion}`);
assert(buildInfo.version === policy.version, `build-info ${buildInfo.version} != release policy ${policy.version}`);
assert(androidPackage.version === policy.version, `Android wrapper ${androidPackage.version} != release policy ${policy.version}`);
assert(rootPackage.scripts?.hipico === 'node tools/hipico-cli/hipico.mjs', 'root hipico script must delegate to the single canonical CLI');
assert(!fs.existsSync(path.join(root, 'scripts/hipico-cli.mjs')), 'duplicate scripts/hipico-cli.mjs must not exist');
assert(index.includes('./assets/js/theme-bootstrap.js'), 'theme bootstrap missing from PWA shell');
assert(index.includes('./assets/js/command-center-shell.js'), 'Command Center shell missing from PWA');
assert(index.includes('./assets/js/version-guard.js'), 'version guard missing from PWA');
assert(serviceWorker.includes('./assets/js/command-center.js'), 'Command Center client missing from service worker shell');
assert(serviceWorker.includes('./assets/js/version-guard.js'), 'version guard missing from service worker shell');
assert(/function isSensitive\(/.test(serviceWorker) && /cache:\s*'no-store'/.test(serviceWorker), 'service worker must keep sensitive/runtime traffic network-only');

const forbidden = [
  { pattern: /\btest\.(?:skip|only)\s*\(/, label: 'test.skip/test.only' },
  { pattern: /\b(?:describe|it)\.(?:skip|only)\s*\(/, label: 'suite skip/only' },
  { pattern: /waitForTimeout\s*\(/, label: 'waitForTimeout/sleep' },
  { pattern: /\bforce\s*:\s*true\b/, label: 'forced browser action' },
  { pattern: /continue-on-error\s*:\s*true/, label: 'continue-on-error' },
  { pattern: /\|\|\s*true(?:\s|$)/m, label: 'shell bypass || true' },
  { pattern: /\b(?:test|describe|it)\.fixme\s*\(/, label: 'fixme bypass' }
];
for (const relative of guarded) {
  assert(fs.existsSync(path.join(root, relative)), `${relative} missing from release candidate`);
  const source = read(relative);
  for (const rule of forbidden) assert(!rule.pattern.test(source), `${relative} contains forbidden ${rule.label}`);
}

const e2eSchema = read('scripts/hipico-apply-e2e-schema-v290.mjs');
assert(e2eSchema.includes('hipico_v13_workspace_sync_security.sql'), 'real workspace/RLS security migration must run in PostgreSQL E2E');
assert(e2eSchema.includes("SET LOCAL ROLE"), 'PostgreSQL E2E must execute least-privilege role checks');
assert(e2eSchema.includes('Workspace RLS owner isolation failed'), 'PostgreSQL E2E must verify owner-scoped workspace isolation');
assert(e2eSchema.includes('Message RLS owner isolation failed'), 'PostgreSQL E2E must verify owner-scoped message isolation');
assert(e2eSchema.includes('hipico_ledger_entries') && e2eSchema.includes('hipico_outbox'), 'PostgreSQL E2E must verify ledger/outbox direct-write denial');

const workflow = read(workflowPath);
assert(/matrix:\s*[\s\S]*browser:\s*\[chromium, firefox, webkit\]/.test(workflow), 'scheduled browser matrix must keep Chromium/Firefox/WebKit');
assert(/postgres:16-alpine/.test(workflow), 'real PostgreSQL 16 service is required');
assert(/poppler-utils tesseract-ocr tesseract-ocr-eng/.test(workflow), 'PDF native/OCR system runtimes must be installed explicitly');
assert(/if:\s*always\(\)[\s\S]*hipico-ephemeral-db-v290\.mjs drop/.test(workflow), 'ephemeral PostgreSQL cleanup must run always');
assert(/production-e2e-v290\.ts/.test(workflow), 'production PostgreSQL E2E must target the final filename');
assert(/security-regression:/.test(workflow), 'explicit security regression gate is required');
assert(/final-release-gate:/.test(workflow), 'fail-closed final release gate is required');
assert(/hipico-verify-evidence-v290\.mjs/.test(workflow), 'final gate must verify SHA-bound artifacts');
assert(/hipico-release-report-v290\.mjs/.test(workflow), 'final gate must emit release report/readiness');
assert(/actions\/download-artifact@v7/.test(workflow), 'final gate must consume upstream artifacts');

const evidenceDir = path.join(root, 'artifacts/qa/hipico-v290');
fs.mkdirSync(evidenceDir, { recursive: true });
const sha = String(process.env.GITHUB_SHA || process.env.HIPICO_QA_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
fs.writeFileSync(path.join(evidenceDir, 'release-contract.json'), `${JSON.stringify({
  schema: 'hipico-release-contract.v290', sha, checkedAt: new Date().toISOString(), status: 'PASS',
  releaseVersion: policy.version, versionCode: policy.versionCode, apiVersion, bridgeProtocolVersion,
  bridgePackageVersion: bridgePackage.version, guardedFiles: guarded
}, null, 2)}\n`);
console.log(`HIPICO_V290_RELEASE_CONTRACT PASS sha=${sha} release=${policy.version}`);
