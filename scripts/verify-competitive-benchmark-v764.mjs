import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function validateCompetitiveBenchmark(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['invalid root'];
  if (!Array.isArray(input.sources) || !Array.isArray(input.features))
    return ['invalid manifest collections'];
  if (input.schemaVersion !== 1 || input.ticket !== 764) errors.push('invalid schema/ticket');
  if (!/^[a-f0-9]{40}$/.test(input.mainBaselineSha ?? '')) errors.push('missing baseline SHA');
  if (input.ossVerticalExtensionBaselineSha !== undefined &&
      !/^[a-f0-9]{40}$/.test(input.ossVerticalExtensionBaselineSha))
    errors.push('invalid vertical extension baseline SHA');
  if (input.ossVerticalExtensionReviewedAt !== undefined &&
      !/^\d{4}-\d{2}-\d{2}$/.test(input.ossVerticalExtensionReviewedAt))
    errors.push('invalid vertical extension reviewed date');
  if (input.policy !== 'BENCHMARK_ONLY_NO_SOURCE_CODE_REUSE') errors.push('unsafe reuse policy');
  if (input.candidateEvidence === 'PASS') errors.push('unsubstantiated PASS');
  const sources = new Map();
  for (const s of input.sources) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      errors.push('invalid product source row');
      continue;
    }
    if (!s.id || sources.has(s.id)) errors.push('missing or duplicate product id');
    sources.set(s.id, s);
    if (s.sourceReuse !== 'NONE') errors.push('unreviewed source reuse: ' + s.id);
    if (!['OFFICIAL', 'SECONDARY', 'UNRESOLVED'].includes(s.sourceLevel)) errors.push('invalid source level: ' + s.id);
    if (s.sourceLevel === 'UNRESOLVED') {
      if (s.kind !== 'UNRESOLVED' || s.sourceUrl || s.license !== 'UNVERIFIED') errors.push('unresolved identity must remain restricted: ' + s.id);
    } else if (!isHttps(s.sourceUrl)) errors.push('source lacks HTTPS provenance: ' + s.id);
    if (s.license !== 'UNVERIFIED' && s.license !== 'UNVERIFIED_RESTRICTED' && !isHttps(s.licenseEvidenceUrl)) errors.push('licensed source lacks evidence: ' + s.id);
    if (s.sourceLevel === 'SECONDARY' && s.licenseEvidenceUrl) errors.push('secondary license evidence unreviewed: ' + s.id);
  }
  const rows = new Set();
  const used = new Set();
  for (const f of input.features) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) {
      errors.push('invalid feature row');
      continue;
    }
    if (!f.id || rows.has(f.id)) errors.push('missing or duplicate feature id');
    rows.add(f.id); used.add(f.productId);
    const s = sources.get(f.productId);
    if (!s) errors.push('unknown product: ' + f.productId);
    if (!f.module || !f.referenceFeature || !f.assessment) errors.push('incomplete matrix row: ' + f.id);
    if (!['DOCUMENTED','PROVISIONAL','UNRESOLVED'].includes(f.referenceEvidenceLevel)) errors.push('invalid reference evidence: ' + f.id);
    if (f.referenceEvidenceLevel === 'DOCUMENTED' && (s?.sourceLevel !== 'OFFICIAL' || !isOfficialFeatureEvidence(f.referenceEvidenceUrl, s))) errors.push('unsupported reference feature claim: ' + f.id);
    if (f.referenceEvidenceLevel !== 'DOCUMENTED' && f.referenceEvidenceUrl != null) errors.push('unverified reference cannot carry evidence URL: ' + f.id);
    if ((s?.sourceLevel === 'UNRESOLVED') !== (f.referenceEvidenceLevel === 'UNRESOLVED')) errors.push('reference identity/evidence mismatch: ' + f.id);
    if (!['EXISTS','PARTIAL','MISSING','NOT_APPLICABLE'].includes(f.status)) errors.push('invalid classification: ' + f.id);
    // This catalog is expressly source/backlog-only, not a browser/PG17
    // evidence authority. It cannot upgrade a feature to EXISTS by editing JSON.
    if (f.status === 'EXISTS') errors.push('runtime parity claim without evidence: ' + f.id);
    if (!['P0','P1','P2','N/A'].includes(f.priority)) errors.push('invalid priority: ' + f.id);
    if (!Number.isInteger(f.ownerIssue) || f.ownerIssue < 1) errors.push('gap without issue owner: ' + f.id);
    if (f.strategy !== 'DESIGN_FROM_BEHAVIOR_ONLY' || f.sourceReuse !== 'NONE') errors.push('unsafe implementation strategy: ' + f.id);
    if (f.assessmentLevel !== 'INFERRED_FROM_BACKLOG' && f.assessmentLevel !== 'UNRESOLVED_REFERENCE') errors.push('unjustified runtime evidence: ' + f.id);
    if (s?.sourceLevel === 'UNRESOLVED' && (f.status !== 'NOT_APPLICABLE' || f.ownerIssue !== 764 || f.assessmentLevel !== 'UNRESOLVED_REFERENCE')) errors.push('unresolved vendor incorrectly actionable: ' + f.id);
    if (f.status === 'NOT_APPLICABLE' && f.priority !== 'N/A') errors.push('N/A priority mismatch: ' + f.id);
    if (f.status !== 'NOT_APPLICABLE' && f.priority === 'N/A') errors.push('actionable without priority: ' + f.id);
  }
  if ((input.sources ?? []).length < 13 || (input.features ?? []).length < 20) errors.push('minimum coverage not met');
  for (const key of sources.keys()) if (!used.has(key)) errors.push('product without a matrix row: ' + key);
  return errors;
}

function isHttps(url) {
  if (typeof url !== 'string' || url.length > 2048) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    // Provenance references must be public documentation URLs, NEVER
    // credential-bearing/private service endpoints or embedded fragments.
    if (u.protocol !== 'https:' || u.username || u.password ||
        u.search || u.hash || !host || host === 'localhost' ||
        host.endsWith('.localhost') || host.endsWith('.local') ||
        host.endsWith('.internal') || host.endsWith('.test') ||
        host.endsWith('.invalid') ||
        /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
        host.includes(':')) return false;
    return true;
  } catch {
    return false;
  }
}


/**
 * A working HTTPS URL is insufficient evidence of a vendor's feature.
 * Keep claims bound to the source publisher. For GitHub-hosted products,
 * the owner/repository path is mandatory; github.com alone is not provenance.
 * ERPNext's first-party Frappe docs are a reviewed cross-origin exception.
 * This is structural provenance validation, not live URL verification.
 */
export function isOfficialFeatureEvidence(referenceUrl, source) {
  if (!source || source.sourceLevel !== 'OFFICIAL' ||
      !isHttps(referenceUrl) || !isHttps(source.sourceUrl)) return false;
  const reference = new URL(referenceUrl);
  const primary = new URL(source.sourceUrl);
  if (reference.origin === primary.origin) {
    if (primary.hostname !== 'github.com') return true;
    const ownerRepo = primary.pathname.split('/').filter(Boolean).slice(0, 2);
    const actual = reference.pathname.split('/').filter(Boolean);
    return ownerRepo.length === 2 && actual[0] === ownerRepo[0] && actual[1] === ownerRepo[1];
  }
  // Frappe publishes ERPNext's own selling/assets documentation on this
  // separate official domain; other unrelated hosts are never accepted.
  return source.id === 'erpnext' &&
    reference.origin === 'https://docs.frappe.io' &&
    (reference.pathname === '/erpnext' || reference.pathname.startsWith('/erpnext/'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const manifest = new URL('../config/competitive-benchmark-v764.json', import.meta.url);
  try {
    const errors = validateCompetitiveBenchmark(JSON.parse(readFileSync(manifest, 'utf8')));
    if (errors.length) { for (const error of errors) console.error('BENCHMARK_CONTRACT: ' + error); process.exitCode = 1; }
    else console.log('BENCHMARK_CONTRACT: valid (product claims are research, not runtime PASS)');
  } catch { console.error('BENCHMARK_CONTRACT: unreadable manifest'); process.exitCode = 1; }
}
