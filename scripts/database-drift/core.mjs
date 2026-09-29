import crypto from 'node:crypto';

export const DRIFT_CATEGORIES = Object.freeze([
  'MISSING_IN_PROD',
  'EXTRA_IN_PROD',
  'TYPE_MISMATCH',
  'CONSTRAINT_MISMATCH',
  'INDEX_MISMATCH',
  'TRIGGER_MISMATCH',
  'POLICY_MISMATCH',
  'FUNCTION_MISMATCH',
  'AUTHORITY_HISTORY_MISSING',
  'EXPECTED_PLATFORM_OBJECT',
]);

const TYPE_ALIASES = new Map([
  ['timestamp with time zone', 'timestamptz'],
  ['timestamp without time zone', 'timestamp'],
  ['character varying', 'varchar'],
  ['integer', 'int4'],
  ['bigint', 'int8'],
  ['smallint', 'int2'],
  ['boolean', 'bool'],
  ['double precision', 'float8'],
  ['real', 'float4'],
]);

const CATEGORY_BY_KIND = Object.freeze({
  constraint: 'CONSTRAINT_MISMATCH',
  index: 'INDEX_MISMATCH',
  trigger: 'TRIGGER_MISMATCH',
  policy: 'POLICY_MISMATCH',
  grant: 'POLICY_MISMATCH',
  table: 'POLICY_MISMATCH',
  function: 'FUNCTION_MISMATCH',
  procedure: 'FUNCTION_MISMATCH',
  type: 'TYPE_MISMATCH',
  sequence: 'TYPE_MISMATCH',
  extension: 'TYPE_MISMATCH',
});

const CRITICAL_FISCAL_TABLES = new Set([
  'FiscalRuleVersion',
  'FiscalSequence',
  'FiscalDocumentRuleSnapshot',
  'FiscalCloseEvidence',
]);
const CRITICAL_LEDGER_COLUMNS = new Set(['postedAt', 'postedBy', 'reversalOfId']);
const CRITICAL_LEDGER_FUNCTIONS = new Set(['guard_ledger_entry_lifecycle', 'guard_posted_ledger_line_mutation']);
const CRITICAL_LEDGER_TRIGGERS = new Set(['LedgerEntry_lifecycle_guard', 'LedgerLine_posted_guard']);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function stableStringify(value) {
  return JSON.stringify(stable(value));
}

export function normalizeType(value) {
  if (value == null) return null;
  const compact = String(value).trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [from, to] of TYPE_ALIASES) {
    if (compact === from) return to;
    if (compact.startsWith(`${from}(`)) return `${to}${compact.slice(from.length)}`;
  }
  return compact.replace(/\s*,\s*/g, ',');
}

export function normalizeExpression(value) {
  if (value == null || value === '') return null;
  let text = String(value).trim();
  text = text.replace(/\bCURRENT_TIMESTAMP\b/gi, 'now()');
  text = text.replace(/\(\s*([a-z_][\w.]*\(\))\s*\)/gi, '$1');
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\s*::\s*/g, '::');
  text = text.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  return text.trim();
}

function normalizeOwner(owner, allowlist = {}) {
  if (owner == null) return owner;
  for (const group of allowlist.ownerEquivalenceGroups ?? []) {
    if (group.includes(owner)) return `owner-group:${[...group].sort().join('|')}`;
  }
  return owner;
}

function normalizeSignature(object, allowlist = {}) {
  const signature = { ...(object.signature ?? {}) };
  if ('owner' in signature) signature.owner = normalizeOwner(signature.owner, allowlist);
  if ('type' in signature) signature.type = normalizeType(signature.type);
  if ('default' in signature) signature.default = normalizeExpression(signature.default);
  if ('definition' in signature) {
    signature.definition = normalizeExpression(signature.definition)
      ?.replace(/^CREATE TRIGGER\s+"?[^"\s]+"?/i, 'CREATE TRIGGER <trigger>') ?? null;
  }
  if ('predicate' in signature) signature.predicate = normalizeExpression(signature.predicate);
  if ('using' in signature) signature.using = normalizeExpression(signature.using);
  if ('withCheck' in signature) signature.withCheck = normalizeExpression(signature.withCheck);
  if (Array.isArray(signature.roles)) signature.roles = [...signature.roles].map(String).sort();
  if (Array.isArray(signature.keys)) signature.keys = signature.keys.map((key) => normalizeExpression(key));
  if (Array.isArray(signature.values)) signature.values = signature.values.map(String);
  return stable(signature);
}

export function normalizeObject(object, allowlist = {}) {
  return {
    ...object,
    schema: object.schema ?? null,
    table: object.table ?? null,
    name: String(object.name),
    signature: normalizeSignature(object, allowlist),
  };
}

function parentKey(object) {
  return `${object.kind}|${object.schema ?? ''}|${object.table ?? ''}`;
}

function identityKey(object) {
  if (object.kind === 'function' || object.kind === 'procedure') {
    return `${parentKey(object)}|${object.name}|${object.identityArguments ?? ''}`;
  }
  if (object.kind === 'grant') {
    return `${parentKey(object)}|${object.objectKind ?? ''}|${object.name}|${object.grantee ?? ''}|${object.privilege ?? ''}`;
  }
  return `${parentKey(object)}|${object.name}`;
}

function semanticSignature(object) {
  return stableStringify(object.signature);
}

function constraintShape(definition = '') {
  const text = normalizeExpression(definition) ?? '';
  const match = text.match(/^(FOREIGN KEY\s*\([^)]*\)|PRIMARY KEY\s*\([^)]*\)|UNIQUE\s*\([^)]*\)|CHECK)/i);
  return match?.[1]?.toLowerCase() ?? text.toLowerCase().slice(0, 80);
}

function structuralKey(object) {
  if (object.kind === 'constraint') {
    return `${parentKey(object)}|${object.signature.type ?? ''}|${constraintShape(object.signature.definition)}`;
  }
  if (object.kind === 'index') {
    return `${parentKey(object)}|${Boolean(object.signature.unique)}|${object.signature.method ?? ''}|${object.signature.keys?.[0] ?? ''}`;
  }
  return identityKey(object);
}

function isPlatformObject(object, allowlist = {}) {
  const schema = object.schema ?? '';
  if ((allowlist.schemas ?? []).includes(schema)) return true;
  if ((allowlist.schemaPrefixes ?? []).some((prefix) => schema.startsWith(prefix))) return true;
  const extension = object.extensionName ?? object.signature?.extensionName;
  if (extension && (allowlist.extensionNames ?? []).includes(extension)) return true;
  return false;
}

function severityFor(category, object) {
  if (category === 'EXPECTED_PLATFORM_OBJECT') return 'INFO';
  if (category === 'AUTHORITY_HISTORY_MISSING') return 'P0';
  if (object.name === '_prisma_migrations') return 'P0';
  if (object.table === 'LedgerEntry' && CRITICAL_LEDGER_COLUMNS.has(object.name)) return 'P0';
  if (object.kind === 'table' && CRITICAL_FISCAL_TABLES.has(object.name)) return 'P0';
  if ((object.kind === 'function' || object.kind === 'procedure') && CRITICAL_LEDGER_FUNCTIONS.has(object.name)) return 'P0';
  if (object.kind === 'trigger' && CRITICAL_LEDGER_TRIGGERS.has(object.name)) return 'P0';
  if (category === 'EXTRA_IN_PROD') return 'P2';
  return 'P1';
}

function remediationFor(object, category) {
  if (category === 'EXPECTED_PLATFORM_OBJECT') return null;
  if (category === 'AUTHORITY_HISTORY_MISSING' || object.name === '_prisma_migrations') {
    return { tickets: ['#626', '#627'], action: 'Reconstruct and verify canonical Prisma migration history before production convergence; do not repair history blindly.' };
  }
  if (object.table === 'LedgerEntry' || object.name === 'LedgerEntry' || CRITICAL_LEDGER_FUNCTIONS.has(object.name) || CRITICAL_LEDGER_TRIGGERS.has(object.name)) {
    return { tickets: ['#628', '#627'], action: 'Rehearse ledger lifecycle migration/backfill and converge production only through the forward-only production plan.' };
  }
  if (CRITICAL_FISCAL_TABLES.has(object.name) || String(object.table ?? '').startsWith('Fiscal')) {
    return { tickets: ['#629', '#627'], action: 'Resolve fiscal single-source authority, prove migration chain, then apply the approved forward-only convergence plan.' };
  }
  return { tickets: ['#626', '#627'], action: 'Prove the expected physical contract from-zero and derive an explicit forward-only migration step before changing production.' };
}

function makeFinding(category, expected, actual) {
  const object = expected ?? actual;
  const cleanObject = {
    kind: object.kind,
    schema: object.schema,
    table: object.table,
    name: object.name,
    ...(object.identityArguments ? { identityArguments: object.identityArguments } : {}),
    ...(object.objectKind ? { objectKind: object.objectKind } : {}),
    ...(object.grantee ? { grantee: object.grantee } : {}),
    ...(object.privilege ? { privilege: object.privilege } : {}),
  };
  return {
    category,
    severity: severityFor(category, cleanObject),
    object: cleanObject,
    expected: expected?.signature ?? null,
    actual: actual?.signature ?? null,
    remediation: remediationFor(cleanObject, category),
  };
}

function mismatchCategory(expected, actual) {
  if (expected.kind === 'column') {
    if (expected.signature.type !== actual.signature.type) return 'TYPE_MISMATCH';
    return 'CONSTRAINT_MISMATCH';
  }
  return CATEGORY_BY_KIND[expected.kind] ?? 'CONSTRAINT_MISMATCH';
}

export function classifyDrift(expectedSnapshot, actualSnapshot, { allowlist = {} } = {}) {
  const expected = (expectedSnapshot.objects ?? []).map((object) => normalizeObject(object, allowlist));
  const actual = (actualSnapshot.objects ?? []).map((object) => normalizeObject(object, allowlist));
  const usedActual = new Set();
  const findings = [];

  for (const exp of expected) {
    if (exp.kind === 'constraint' || exp.kind === 'index') {
      const equivalentIndex = actual.findIndex((candidate, index) =>
        !usedActual.has(index)
        && candidate.kind === exp.kind
        && parentKey(candidate) === parentKey(exp)
        && semanticSignature(candidate) === semanticSignature(exp));
      if (equivalentIndex >= 0) {
        usedActual.add(equivalentIndex);
        continue;
      }
    }

    let actualIndex = actual.findIndex((candidate, index) => !usedActual.has(index) && identityKey(candidate) === identityKey(exp));
    if (actualIndex < 0 && (exp.kind === 'constraint' || exp.kind === 'index')) {
      actualIndex = actual.findIndex((candidate, index) =>
        !usedActual.has(index)
        && candidate.kind === exp.kind
        && structuralKey(candidate) === structuralKey(exp));
    }

    if (actualIndex < 0) {
      const category = isPlatformObject(exp, allowlist)
        ? 'EXPECTED_PLATFORM_OBJECT'
        : exp.name === '_prisma_migrations' ? 'AUTHORITY_HISTORY_MISSING' : 'MISSING_IN_PROD';
      findings.push(makeFinding(category, exp, null));
      continue;
    }

    usedActual.add(actualIndex);
    const act = actual[actualIndex];
    if (semanticSignature(exp) !== semanticSignature(act)) {
      const category = isPlatformObject(exp, allowlist) || isPlatformObject(act, allowlist)
        ? 'EXPECTED_PLATFORM_OBJECT'
        : mismatchCategory(exp, act);
      findings.push(makeFinding(category, exp, act));
    }
  }

  actual.forEach((act, index) => {
    if (usedActual.has(index)) return;
    const category = isPlatformObject(act, allowlist) ? 'EXPECTED_PLATFORM_OBJECT' : 'EXTRA_IN_PROD';
    findings.push(makeFinding(category, null, act));
  });

  return findings.sort((a, b) => {
    const severityRank = { P0: 0, P1: 1, P2: 2, INFO: 3 };
    return (severityRank[a.severity] - severityRank[b.severity])
      || a.category.localeCompare(b.category)
      || `${a.object.schema}.${a.object.table ?? ''}.${a.object.name}`.localeCompare(`${b.object.schema}.${b.object.table ?? ''}.${b.object.name}`);
  });
}

function summaryFor(findings) {
  const byCategory = {};
  const bySeverity = {};
  for (const finding of findings) {
    byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
  }
  return { total: findings.length, byCategory: stable(byCategory), bySeverity: stable(bySeverity) };
}

function digestPayload(manifest) {
  const clone = structuredClone(manifest);
  delete clone.generatedAt;
  delete clone.deterministicDigest;
  return clone;
}

export function deterministicDigest(manifest) {
  return crypto.createHash('sha256').update(stableStringify(digestPayload(manifest))).digest('hex');
}

export function buildDriftManifest({
  repoSha,
  projectRef,
  expected,
  actual,
  allowlist,
  generatedAt = new Date().toISOString(),
  repoAuthority = null,
  prismaVersion = null,
  migrationChain = null,
  authorityGaps = [],
}) {
  if (!repoSha || !projectRef) throw new Error('repoSha and projectRef are required');
  const findings = classifyDrift(expected, actual, { allowlist });
  const manifest = {
    manifestVersion: 1,
    generatedAt,
    source: {
      repoSha,
      projectRef,
      prismaVersion,
      expectedPostgresVersion: expected.metadata?.postgresVersion ?? null,
      actualPostgresVersion: actual.metadata?.postgresVersion ?? null,
    },
    authority: {
      migrationChain,
      repoAuthority,
      platformAllowlistVersion: allowlist?.version ?? null,
      gaps: [...authorityGaps].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
    },
    summary: summaryFor(findings),
    findings,
  };
  manifest.deterministicDigest = deterministicDigest(manifest);
  assertManifestSafe(manifest);
  return manifest;
}

const UNSAFE_PATTERNS = [
  /postgres(?:ql)?:\/\/[\w%+.-]+:[^@\s]+@/i,
  /\b(?:password|passwd|secret|service_role_key|anon_key|jwt)\s*[=:]\s*[^\s,}]+/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/,
];

export function assertManifestSafe(manifest) {
  const serialized = JSON.stringify(manifest);
  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(serialized)) throw new Error('unsafe secret-like value detected in drift manifest');
  }
  return true;
}
