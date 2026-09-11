import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const assert = (condition, message) => { if (!condition) throw new Error(`HIPICO_V290_RELEASE_BLOCKED: ${message}`); };

const policy = json('products/hipico-control/release-policy.json');
const bridgePackage = json('tools/hipico-whatsapp-web-bridge/package.json');
const domain = read('backend/src/modules/hipico/hipico-domain.ts');
const workflowPath = '.github/workflows/hipico-production-gates-v290.yml';
const guarded = [
  'qa/hipico-production-v290.spec.mjs',
  'backend/src/modules/hipico/production-e2e.test.ts',
  'backend/scripts/hipico-restart-recovery-v290.ts',
  'backend/scripts/hipico-load-profile-v290.ts',
  ...(fs.existsSync(path.join(root, workflowPath)) ? [workflowPath] : [])
];

execFileSync(process.execPath, ['scripts/hipico-release-v118.mjs'], { cwd: root, stdio: 'inherit', env: process.env });
const apiVersion = domain.match(/HIPICO_API_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
const bridgeProtocolVersion = domain.match(/HIPICO_BRIDGE_PROTOCOL_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
assert(apiVersion === policy.apiVersion, `backend API ${apiVersion || 'unknown'} != release policy ${policy.apiVersion}`);
assert(bridgeProtocolVersion === policy.bridgeProtocolVersion, `bridge protocol ${bridgeProtocolVersion || 'unknown'} != release policy ${policy.bridgeProtocolVersion}`);
assert(bridgePackage.version === policy.bridgePackageVersion, `bridge package ${bridgePackage.version} != release policy ${policy.bridgePackageVersion}`);

const forbidden = [
  { pattern: /\btest\.(?:skip|only)\s*\(/, label: 'test.skip/test.only' },
  { pattern: /\b(?:describe|it)\.(?:skip|only)\s*\(/, label: 'suite skip/only' },
  { pattern: /waitForTimeout\s*\(/, label: 'waitForTimeout/sleep' },
  { pattern: /\bforce\s*:\s*true\b/, label: 'forced browser action' },
  { pattern: /continue-on-error\s*:\s*true/, label: 'continue-on-error' },
  { pattern: /\|\|\s*true(?:\s|$)/m, label: 'shell bypass || true' }
];
for (const relative of guarded) {
  const source = read(relative);
  for (const rule of forbidden) assert(!rule.pattern.test(source), `${relative} contains forbidden ${rule.label}`);
}

const evidenceDir = path.join(root, 'artifacts/qa/hipico-v290');
fs.mkdirSync(evidenceDir, { recursive: true });
const sha = String(process.env.GITHUB_SHA || process.env.HIPICO_QA_SHA || 'local');
fs.writeFileSync(path.join(evidenceDir, 'release-contract.json'), `${JSON.stringify({
  schema: 'hipico-release-contract.v290',
  sha,
  checkedAt: new Date().toISOString(),
  status: 'PASS',
  releaseVersion: policy.version,
  apiVersion,
  bridgeProtocolVersion,
  bridgePackageVersion: bridgePackage.version,
  guardedFiles: guarded
}, null, 2)}\n`);
console.log(`HIPICO_V290_RELEASE_CONTRACT PASS sha=${sha} release=${policy.version}`);
