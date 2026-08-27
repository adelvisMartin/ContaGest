import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalogPath = path.join(root, 'backend', 'src', 'shared', 'legal', 'legalCatalog.ts');
const defaultAttestationPath = path.join(root, 'backend', 'src', 'shared', 'legal', 'LEGAL_RELEASE_ATTESTATION.json');
const attestationPath = process.env.LEGAL_RELEASE_ATTESTATION_PATH
  ? path.resolve(process.env.LEGAL_RELEASE_ATTESTATION_PATH)
  : defaultAttestationPath;
const reportPath = path.join(root, 'artifacts', 'qa', 'legal-production-gate.json');

const providerFields = [
  'LEGAL_PROVIDER_NAME',
  'LEGAL_PROVIDER_RIF',
  'LEGAL_PROVIDER_ADDRESS',
  'LEGAL_CONTACT_EMAIL',
  'LEGAL_SUPPORT_EMAIL'
];
const providerAttestationMap = {
  LEGAL_PROVIDER_NAME:'name',
  LEGAL_PROVIDER_RIF:'rif',
  LEGAL_PROVIDER_ADDRESS:'address',
  LEGAL_CONTACT_EMAIL:'legalEmail',
  LEGAL_SUPPORT_EMAIL:'supportEmail'
};

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
  'humanHealthAddendum'
];

const checks = [];
const addCheck = (id, pass, detail) => checks.push({ id, pass:Boolean(pass), detail });
const valueOf = (name) => String(process.env[name] || '').trim();
const looksPlaceholder = (value) => {
  const normalized = String(value || '').trim();
  return !normalized
    || /^\[.*\]$/.test(normalized)
    || /replace[_ -]?with|pendiente|placeholder|your[_ -]|changeme|example\.com/i.test(normalized);
};
const looksEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const looksSha256 = (value) => /^[a-f0-9]{64}$/i.test(String(value || '').trim());

let currentVersion = null;
try {
  const catalog = fs.readFileSync(catalogPath, 'utf8');
  currentVersion = catalog.match(/LEGAL_DOCUMENT_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] || null;
} catch (error) {
  addCheck('catalog.readable', false, `No se pudo leer legalCatalog.ts: ${error?.message || error}`);
}
addCheck('catalog.version', Boolean(currentVersion), currentVersion ? `Versión canónica: ${currentVersion}` : 'No se pudo determinar LEGAL_DOCUMENT_VERSION.');

for (const name of providerFields) {
  const value = valueOf(name);
  addCheck(`provider.${name}`, !looksPlaceholder(value), value && !looksPlaceholder(value) ? 'Configurado.' : 'Falta un valor real; no se aceptan placeholders.');
}
addCheck('provider.LEGAL_CONTACT_EMAIL.format', looksEmail(valueOf('LEGAL_CONTACT_EMAIL')), 'Debe ser un correo real con formato válido.');
addCheck('provider.LEGAL_SUPPORT_EMAIL.format', looksEmail(valueOf('LEGAL_SUPPORT_EMAIL')), 'Debe ser un correo real con formato válido.');

const runtimeApprovedVersion=valueOf('LEGAL_REVIEW_APPROVED_VERSION');
const runtimeEvidenceSha256=valueOf('LEGAL_REVIEW_EVIDENCE_SHA256');
addCheck(
  'runtime.LEGAL_REVIEW_APPROVED_VERSION',
  Boolean(currentVersion)&&runtimeApprovedVersion===currentVersion,
  `Debe coincidir exactamente con ${currentVersion||'LEGAL_DOCUMENT_VERSION'}.`
);
addCheck(
  'runtime.LEGAL_REVIEW_EVIDENCE_SHA256',
  looksSha256(runtimeEvidenceSha256),
  'Debe contener el SHA-256 de la evidencia profesional aprobada.'
);

let attestation = null;
if (!fs.existsSync(attestationPath)) {
  addCheck('attestation.exists', false, `Falta ${path.relative(root, attestationPath) || attestationPath}.`);
} else {
  addCheck('attestation.exists', true, `Encontrada: ${path.relative(root, attestationPath) || attestationPath}.`);
  try {
    attestation = JSON.parse(fs.readFileSync(attestationPath, 'utf8'));
  } catch (error) {
    addCheck('attestation.json', false, `JSON inválido: ${error?.message || error}`);
  }
}

if (attestation) {
  addCheck('attestation.schemaVersion', attestation.schemaVersion === 1, 'schemaVersion debe ser 1.');
  addCheck('attestation.status', attestation.status === 'approved', 'status debe ser approved.');
  addCheck(
    'attestation.legalDocumentVersion',
    Boolean(currentVersion) && attestation.legalDocumentVersion === currentVersion,
    `La aprobación debe corresponder exactamente a ${currentVersion || 'la versión canónica'}.`
  );
  const reviewedAt = Date.parse(String(attestation.reviewedAt || ''));
  addCheck('attestation.reviewedAt', Number.isFinite(reviewedAt), 'reviewedAt debe ser una fecha ISO válida.');
  addCheck('attestation.reviewer.name', Boolean(String(attestation.reviewer?.name || '').trim()), 'Debe identificarse el profesional revisor.');
  addCheck(
    'attestation.reviewer.jurisdiction',
    /^(VE|Venezuela)$/i.test(String(attestation.reviewer?.jurisdiction || '').trim()),
    'La revisión de este gate debe declarar jurisdicción Venezuela/VE.'
  );
  addCheck('attestation.evidence.reference', Boolean(String(attestation.evidence?.reference || '').trim()), 'Debe existir una referencia a la evidencia profesional adjunta al release.');
  addCheck('attestation.evidence.sha256', looksSha256(attestation.evidence?.sha256), 'La evidencia profesional debe registrar un SHA-256 de 64 hexadecimales.');
  addCheck(
    'runtime.evidence.matches-attestation',
    looksSha256(attestation.evidence?.sha256)&&runtimeEvidenceSha256.toLowerCase()===String(attestation.evidence.sha256).toLowerCase(),
    'LEGAL_REVIEW_EVIDENCE_SHA256 debe coincidir con el hash declarado en la atestación.'
  );

  for (const [envName,attestationName] of Object.entries(providerAttestationMap)) {
    addCheck(
      `attestation.provider.${attestationName}`,
      valueOf(envName)===String(attestation.provider?.[attestationName]||'').trim(),
      `${attestationName} debe coincidir exactamente con ${envName}.`
    );
  }

  for (const approval of requiredApprovals) {
    addCheck(`approval.${approval}`, attestation.approvals?.[approval] === true, `La aprobación ${approval} debe ser true.`);
  }
}

const failures = checks.filter((check) => !check.pass);
const verdict = failures.length ? 'BLOCKED' : 'PASS';
const report = {
  schemaVersion: 1,
  verdict,
  checkedAt: new Date().toISOString(),
  legalDocumentVersion: currentVersion,
  attestationPath: path.relative(root, attestationPath) || attestationPath,
  checks
};

fs.mkdirSync(path.dirname(reportPath), { recursive:true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log('\n=== ContaGest #29 · Production Legal Gate ===');
for (const check of checks) console.log(`${check.pass ? 'PASS' : 'BLOCKED'}  ${check.id} — ${check.detail}`);
console.log(`\nVERDICT: ${verdict}`);
console.log(`Evidence report: ${path.relative(root, reportPath)}`);
if (verdict !== 'PASS') {
  console.log('No autoriza clientes/datos reales. Complete identidad, atestación profesional versionada y variables runtime vinculadas a la versión legal vigente.');
}

process.exitCode = failures.length ? 1 : 0;
