import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

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

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const normalize = (value) => String(value || '').replace(/\r\n/g, '\n');

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

const blockers = [];
if (files.some((entry) => entry.status !== 'PRESENT')) blockers.push('canonical-file-missing');
if (!attestation) blockers.push('attestation-invalid-or-missing');
if (attestation?.status !== 'approved') blockers.push('professional-attestation-not-approved');
if (!legalDocumentVersion || attestation?.legalDocumentVersion !== legalDocumentVersion) blockers.push('attestation-version-mismatch');
if (!String(attestation?.reviewer?.name || '').trim()) blockers.push('reviewer-not-identified');
if (!/^[a-f0-9]{64}$/i.test(String(attestation?.evidence?.sha256 || ''))) blockers.push('professional-evidence-hash-missing');
if (!String(attestation?.evidence?.reference || '').trim()) blockers.push('professional-evidence-reference-missing');

const verdict = blockers.length ? 'BLOCKED' : 'PASS';
const manifestCore = {
  schemaVersion: 1,
  issue: 29,
  product: 'ContaGest VE',
  verdict,
  generatedAt: new Date().toISOString(),
  legalDocumentVersion,
  attestationStatus: attestation?.status || null,
  reviewer: attestation?.reviewer?.name ? { name: attestation.reviewer.name, jurisdiction: attestation.reviewer.jurisdiction || null } : null,
  evidenceReference: attestation?.evidence?.reference || null,
  evidenceSha256: attestation?.evidence?.sha256 || null,
  blockers,
  files,
};
const manifestHash = sha256(Buffer.from(JSON.stringify(manifestCore)));
const report = { ...manifestCore, manifestSha256: manifestHash };

mkdirSync(outputDir, { recursive: true });
const jsonPath = join(outputDir, 'LEGAL_REVIEW_EVIDENCE.json');
const mdPath = join(outputDir, 'LEGAL_REVIEW_EVIDENCE.md');
const sumsPath = join(outputDir, 'SHA256SUMS.txt');
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
writeFileSync(mdPath, [
  '# ContaGest #29 · professional legal review evidence',
  '',
  `- Verdict: **${verdict}**`,
  `- Legal document version: \`${legalDocumentVersion || 'UNKNOWN'}\``,
  `- Attestation status: \`${attestation?.status || 'UNKNOWN'}\``,
  `- Manifest SHA-256: \`${manifestHash}\``,
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
  '> PASS proves a version/hash chain only. It does not turn engineering output into legal advice and does not replace professional review.',
  '',
].join('\n'), 'utf8');
writeFileSync(sumsPath, [jsonPath, mdPath].map((file) => `${sha256(readFileSync(file))}  ${relative(outputDir, file)}`).join('\n') + '\n', 'utf8');

console.log(`[legal-evidence-v29] ${verdict} · version=${legalDocumentVersion || 'UNKNOWN'} · ${relative(root, outputDir)}`);
for (const blocker of blockers) console.log(`BLOCKED ${blocker}`);
process.exitCode = verdict === 'PASS' ? 0 : 2;
