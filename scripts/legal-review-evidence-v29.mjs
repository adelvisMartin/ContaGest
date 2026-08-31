import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const outputDir = resolve(process.env.LEGAL_EVIDENCE_OUTPUT_DIR || join(root, 'artifacts', 'release', 'legal-v29'));
const canonicalFiles = [
  'backend/src/shared/legal/legalCatalog.ts',
  'backend/src/shared/legal/LEGAL_RELEASE_ATTESTATION.json',
  'docs/legal/LEGAL_BASIS_MATRIX_V1.md',
  'docs/legal/LEGAL_REVIEW_HANDOFF_V1.md',
  'docs/legal/PRODUCTION_LEGAL_CHECKLIST.md',
  'docs/legal/VENEZUELA_LEGAL_SOURCES_REVIEW_V1.md',
];
const providerKeys = ['name', 'rif', 'address', 'legalEmail', 'supportEmail'];
const requiredApprovals = [
  'professionalReview',
  'providerIdentity',
  'terms',
  'privacy',
  'cookies',
  'acceptableUse',
  'suspensionTermination',
  'jurisdictionDisputes',
  'billingTaxCurrency',
  'accountingTaxRetention',
  'subprocessorsTransfers',
  'cancellationRefundDelinquency',
  'ipEvidencePolicy',
  'humanHealthAddendum',
];

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const normalize = (value) => String(value || '').replace(/\r\n/g, '\n');
const gitText = (args) => {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim(); }
  catch { return ''; }
};

const candidate = {
  sha: gitText(['rev-parse', 'HEAD']) || null,
  branch: gitText(['branch', '--show-current']) || 'DETACHED',
  dirty: Boolean(gitText(['status', '--porcelain=v1'])),
};

const files = canonicalFiles.map((path) => {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return { path, status: 'MISSING', sha256: null, bytes: 0 };
  const raw = readFileSync(absolute);
  return { path, status: 'PRESENT', sha256: sha256(raw), bytes: raw.length };
});

let attestation = null;
try {
  attestation = JSON.parse(readFileSync(join(root, 'backend/src/shared/legal/LEGAL_RELEASE_ATTESTATION.json'), 'utf8'));
} catch {}

const catalog = existsSync(join(root, 'backend/src/shared/legal/legalCatalog.ts'))
  ? normalize(readFileSync(join(root, 'backend/src/shared/legal/legalCatalog.ts'), 'utf8'))
  : '';
const legalDocumentVersion = catalog.match(/LEGAL_DOCUMENT_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] || null;
const providerComplete = providerKeys.every((key) => String(attestation?.provider?.[key] || '').trim());
const reviewedAt = Date.parse(String(attestation?.reviewedAt || ''));

const blockers = [];
if (files.some((entry) => entry.status !== 'PRESENT')) blockers.push('canonical-file-missing');
if (!candidate.sha || !/^[0-9a-f]{40}$/i.test(candidate.sha)) blockers.push('candidate-sha-unknown');
if (candidate.dirty) blockers.push('working-tree-dirty');
if (!attestation) blockers.push('attestation-invalid-or-missing');
if (attestation?.schemaVersion !== 1) blockers.push('attestation-schema-version-invalid');
if (attestation?.status !== 'approved') blockers.push('professional-attestation-not-approved');
if (!Number.isFinite(reviewedAt)) blockers.push('professional-reviewed-at-missing');
if (!providerComplete) blockers.push('provider-identity-incomplete');
if (!legalDocumentVersion || attestation?.legalDocumentVersion !== legalDocumentVersion) blockers.push('attestation-version-mismatch');
if (!String(attestation?.reviewer?.name || '').trim()) blockers.push('reviewer-not-identified');
if (!/^(VE|Venezuela)$/i.test(String(attestation?.reviewer?.jurisdiction || '').trim())) blockers.push('reviewer-jurisdiction-not-venezuela');
if (!/^[a-f0-9]{64}$/i.test(String(attestation?.evidence?.sha256 || ''))) blockers.push('professional-evidence-hash-missing');
if (!String(attestation?.evidence?.reference || '').trim()) blockers.push('professional-evidence-reference-missing');
for (const approval of requiredApprovals) {
  if (attestation?.approvals?.[approval] !== true) blockers.push(`approval-${approval}-missing`);
}

const verdict = blockers.length ? 'BLOCKED' : 'PASS';
const contentSetSha256 = sha256(Buffer.from(JSON.stringify({
  legalDocumentVersion,
  files: files.map(({ path, status, sha256: digest, bytes }) => ({ path, status, sha256: digest, bytes })),
})));
const approvalState = Object.fromEntries(requiredApprovals.map((name) => [name, attestation?.approvals?.[name] === true]));
const report = {
  schemaVersion: 3,
  issue: 29,
  product: 'ContaGest VE',
  verdict,
  generatedAt: new Date().toISOString(),
  candidate,
  legalDocumentVersion,
  contentSetSha256,
  attestationStatus: attestation?.status || null,
  reviewedAt: Number.isFinite(reviewedAt) ? new Date(reviewedAt).toISOString() : null,
  approvals: approvalState,
  approvalsComplete: requiredApprovals.every((name) => approvalState[name] === true),
  providerIdentityApproved: attestation?.approvals?.providerIdentity === true && providerComplete,
  reviewer: attestation?.reviewer?.name ? { name: attestation.reviewer.name, jurisdiction: attestation.reviewer.jurisdiction || null } : null,
  evidenceReference: attestation?.evidence?.reference || null,
  evidenceSha256: attestation?.evidence?.sha256 || null,
  blockers,
  files,
};

mkdirSync(outputDir, { recursive: true });
const jsonPath = join(outputDir, 'LEGAL_REVIEW_EVIDENCE.json');
const mdPath = join(outputDir, 'LEGAL_REVIEW_EVIDENCE.md');
const sumsPath = join(outputDir, 'SHA256SUMS.txt');
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
writeFileSync(mdPath, [
  '# ContaGest #29 · professional legal review evidence',
  '',
  `- Verdict: **${verdict}**`,
  `- Candidate SHA: \`${candidate.sha || 'UNKNOWN'}\``,
  `- Branch: \`${candidate.branch}\``,
  `- Dirty working tree: **${candidate.dirty ? 'YES' : 'NO'}**`,
  `- Legal document version: \`${legalDocumentVersion || 'UNKNOWN'}\``,
  `- Attestation status: \`${attestation?.status || 'UNKNOWN'}\``,
  `- Reviewed at: \`${report.reviewedAt || 'MISSING'}\``,
  `- All required approvals: **${report.approvalsComplete ? 'YES' : 'NO'}**`,
  `- Canonical content-set SHA-256: \`${contentSetSha256}\``,
  '',
  '## Required approvals',
  '',
  ...requiredApprovals.map((name) => `- ${approvalState[name] ? 'PASS' : 'BLOCKED'} \`${name}\``),
  '',
  '## Canonical files',
  '',
  '| File | Status | SHA-256 |',
  '|---|---|---|',
  ...files.map((entry) => `| \`${entry.path}\` | ${entry.status} | ${entry.sha256 || '—'} |`),
  '',
  '## Blockers',
  '',
  ...(blockers.length ? blockers.map((blocker) => `- ${blocker}`) : ['- none']),
  '',
  '> PASS proves a candidate-bound version/hash chain only. It does not turn engineering output into legal advice and does not replace professional review.',
  '',
].join('\n'), 'utf8');
writeFileSync(sumsPath, [jsonPath, mdPath].map((file) => `${sha256(readFileSync(file))}  ${relative(outputDir, file)}`).join('\n') + '\n', 'utf8');

console.log(`[legal-evidence-v29] ${verdict} · sha=${candidate.sha || 'UNKNOWN'} · version=${legalDocumentVersion || 'UNKNOWN'} · ${relative(root, outputDir)}`);
for (const blocker of blockers) console.log(`BLOCKED ${blocker}`);
process.exitCode = verdict === 'PASS' ? 0 : 2;
