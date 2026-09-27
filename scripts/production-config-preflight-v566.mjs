import fs from 'node:fs';
import crypto from 'node:crypto';

const contract = JSON.parse(fs.readFileSync('ops/release/production-config-v566.json', 'utf8'));
const environment = String(process.argv.find((arg) => arg.startsWith('--environment='))?.split('=')[1] || process.env.DEPLOY_ENV || '').trim();
if (!contract.environments[environment]) throw new Error(`Unknown deployment environment: ${environment || '(missing)'}`);

const spec = contract.environments[environment];
const missing = [];
const invalid = [];
const status = [];
const placeholder = /^(?:replace|change|your-|dev-|test-|example|sample|secret|demo|placeholder)/i;

function present(name) {
  return String(process.env[name] || '').trim();
}
function safeSecret(name) {
  const value = present(name);
  return value.length >= 32 && !placeholder.test(value) && !/(?:dev[_-](?:secret|license)|change[_-]?me)/i.test(value);
}
function record(name, kind, valid) {
  status.push({ name, kind, configured: Boolean(present(name)), valid });
  if (!present(name)) missing.push(name);
  else if (!valid) invalid.push(name);
}

for (const name of spec.requiredNonSecret) record(name, 'non-secret', true);
for (const name of spec.requiredSecret) record(name, 'secret', safeSecret(name));

const sha = present('GIT_COMMIT_SHA');
if (['staging', 'production'].includes(environment) && !/^[a-f0-9]{40}$/i.test(sha)) invalid.push('GIT_COMMIT_SHA');
if (['staging', 'production'].includes(environment) && present('NODE_ENV') !== 'production') invalid.push('NODE_ENV');
if (['staging', 'production'].includes(environment) && present('ALLOW_DEV_TENANT_HEADER').toLowerCase() === 'true') invalid.push('ALLOW_DEV_TENANT_HEADER');

const report = {
  schemaVersion: 1,
  environment,
  candidateSha: /^[a-f0-9]{40}$/i.test(sha) ? sha : null,
  contractHash: crypto.createHash('sha256').update(JSON.stringify(contract)).digest('hex'),
  checks: status,
  missing: [...new Set(missing)].sort(),
  invalid: [...new Set(invalid)].sort(),
  ok: missing.length === 0 && invalid.length === 0,
};
fs.mkdirSync('artifacts/release', { recursive: true });
fs.writeFileSync('artifacts/release/config-preflight-v566.json', `${JSON.stringify(report, null, 2)}\n`);
for (const row of status) console.log(`${row.name}: ${row.valid ? 'READY' : 'INVALID_OR_MISSING'} (${row.kind})`);
if (!report.ok) {
  console.error(`Production config preflight failed. Missing names: ${report.missing.join(', ') || 'none'}; invalid names: ${report.invalid.join(', ') || 'none'}`);
  process.exitCode = 1;
}
