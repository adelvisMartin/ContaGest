import fs from 'node:fs';
import crypto from 'node:crypto';

const manifestPath = 'docs/evidence/benchmark-evidence-manifest-v589.json';
const catalogPath = 'qa/support/module-visual-catalog.mjs';
const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestRaw);
const catalog = fs.readFileSync(catalogPath, 'utf8');
const candidateSha = String(process.env.CANDIDATE_SHA || process.env.GITHUB_SHA || '').trim();
const allowed = new Set(['VERIFIED', 'PARTIAL', 'NOT_VERIFIED', 'NOT_APPLICABLE']);
const requiredVerticals = new Set(['enterprise', 'empresas', 'odontologia', 'gimnasio', 'veterinaria', 'control-hipico']);
const routeSet = new Set([...catalog.matchAll(/route:'([^']+)'/g)].map((match) => match[1]));
const findings = [];
const seenCapabilities = new Set();

function duplicates(values) {
  const seen = new Set();
  return values.filter((value) => seen.has(value) || !seen.add(value));
}

for (const vertical of manifest.verticals || []) {
  requiredVerticals.delete(vertical.id);
  for (const capability of vertical.capabilities || []) {
    const key = `${vertical.id}:${capability.id}`;
    if (seenCapabilities.has(key)) findings.push(`DUPLICATE_CAPABILITY:${key}`);
    seenCapabilities.add(key);
    if (!allowed.has(capability.status)) findings.push(`INVALID_STATUS:${key}:${capability.status}`);
    if (!allowed.has(capability.runtime)) findings.push(`INVALID_RUNTIME_STATUS:${key}:${capability.runtime}`);
    for (const field of ['routes', 'apis', 'tests', 'history']) {
      const values = Array.isArray(capability[field]) ? capability[field] : [];
      for (const duplicate of duplicates(values)) findings.push(`DUPLICATE_${field.toUpperCase()}:${key}:${duplicate}`);
    }
    for (const route of capability.routes || []) if (!routeSet.has(route)) findings.push(`UNKNOWN_ROUTE:${key}:${route}`);
    for (const api of capability.apis || []) if (!String(api).startsWith('/api/v1')) findings.push(`NON_CANONICAL_API:${key}:${api}`);
    for (const testPath of capability.tests || []) if (!fs.existsSync(testPath)) findings.push(`MISSING_TEST:${key}:${testPath}`);
    for (const issue of capability.history || []) if (!/^#\d+$/.test(issue)) findings.push(`INVALID_HISTORY_REF:${key}:${issue}`);
    const hasEvidence = (capability.routes?.length || 0) + (capability.apis?.length || 0) + (capability.tests?.length || 0) + (capability.history?.length || 0) > 0;
    if (!hasEvidence && capability.status !== 'NOT_VERIFIED' && capability.status !== 'NOT_APPLICABLE') findings.push(`EVIDENCELESS_CLAIM:${key}`);
    if (capability.status === 'VERIFIED' && capability.runtime !== 'VERIFIED') findings.push(`VERIFIED_WITHOUT_RUNTIME:${key}`);
  }
}
for (const missing of requiredVerticals) findings.push(`MISSING_VERTICAL:${missing}`);

const forbidden = /(-----BEGIN [A-Z ]+PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,})/;
if (forbidden.test(manifestRaw)) findings.push('POTENTIAL_SECRET_IN_MANIFEST');

const report = {
  schemaVersion: 1,
  ticket: '#589',
  candidateSha: /^[a-f0-9]{40}$/i.test(candidateSha) ? candidateSha : null,
  sourceHash: crypto.createHash('sha256').update(manifestRaw).digest('hex'),
  verticalCount: manifest.verticals?.length || 0,
  capabilityCount: seenCapabilities.size,
  findings,
  ok: findings.length === 0,
};
fs.mkdirSync('artifacts/evidence', { recursive: true });
fs.writeFileSync('artifacts/evidence/benchmark-evidence-v589.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
