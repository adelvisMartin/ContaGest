import { gatesForFiles } from './domain-risk-catalog.mjs';

// Selection is narrower than agent routing: the latter deliberately matches broad
// domains for review, whereas this contract chooses executable local QA profiles.
export const RISK_PROFILE_ORDER = Object.freeze([
  'docs', 'agent', 'backend', 'frontend', 'database', 'financial', 'security', 'ui', 'ui-routes', 'infra',
]);
const allowed = new Set(RISK_PROFILE_ORDER);

function normalizeFile(value) {
  const file = String(value).trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (!file || file.startsWith('/') || file.split('/').includes('..')) throw new Error(`RISK_FILE_INVALID:${file}`);
  return file;
}

function reasonsForFile(file) {
  const matched = new Set();
  const add = (...profiles) => profiles.forEach((profile) => matched.add(profile));

  if (/^(docs\/|README\.md$|CHANGELOG\.md$|CONTRIBUTING\.md$|LICENSE$)/.test(file) || /\.md$/i.test(file)) add('docs');
  if (/^(AGENTS\.md|agent-skills\.lock\.json|\.agents\/|scripts\/(agent-|verify-agent)|qa\/support\/domain-risk-catalog\.mjs)/.test(file)) add('agent');
  if (/^(backend\/prisma\/|supabase\/.*\.sql$|supabase\/migrations\/)/.test(file)) add('database', 'backend');
  if (/^(backend\/src\/modules\/(accounting|banking|bank-reconciliation|fiscal|payroll|sales|purchases|payables|inventory|pricing|currency|chart-accounts)\/|backend\/src\/shared\/(financial|services\/(ledger|financial|fiscal|inventory))|qa\/(financial|ledger|fiscal|bank|payables|inventory))/.test(file)) add('financial', 'database');
  if (/^(backend\/src\/(modules\/(auth|rbac|user-security|commercial-access|media)\/|shared\/(middleware\/context|auth|security)|database\/(runtime-tenant|auth-bootstrap|tenant-prisma))|qa\/.*(auth|security|tenant-isolation))/.test(file) || /(^|\/)(security|rls|permissions)(\/|\.)/i.test(file)) add('backend', 'database', 'security');
  if (/^backend\/src\/modules\/(crud\.factory|route-manifest)\.ts$/.test(file)) add('backend', 'database', 'security');
  if (/^backend\//.test(file)) add('backend');
  if (/^frontend\//.test(file)) add('frontend');
  if (/^frontend\/(src\/(styles|components)\/|index\.html$)/.test(file)) add('ui');
  if (/^frontend\/src\/(pages|routes)\//.test(file) || /^qa\/.*\.spec\.m?js$/.test(file)) add('ui-routes');
  if (/^(\.github\/workflows\/|ops\/|Dockerfile|docker-compose|vercel\.json$|render\.yaml$|package(-lock)?\.json$|backend\/package\.json$|frontend\/package\.json$)/.test(file)) add('infra');
  if (/^(tests\/|qa\/)/.test(file) && matched.size === 0) add('backend');
  if (/^scripts\//.test(file) && matched.size === 0) add('backend');
  if (matched.size === 0) add('backend', 'frontend'); // Unknown source is never treated as docs-only.
  return [...matched].sort((a, b) => RISK_PROFILE_ORDER.indexOf(a) - RISK_PROFILE_ORDER.indexOf(b));
}

export function classifyChangeRisk(files, { addProfiles = [], removeProfiles = [], reason = '' } = {}) {
  if (!Array.isArray(files)) throw new Error('RISK_FILES_REQUIRED');
  const normalized = [...new Set(files.map(normalizeFile))].sort();
  const checks = normalized.map((file) => ({ file, profiles: reasonsForFile(file) }));
  const selected = new Set(checks.flatMap((item) => item.profiles));
  if (!checks.length) selected.add('backend'); // no diff context: fail safe
  for (const profile of [...addProfiles, ...removeProfiles]) {
    if (!allowed.has(profile)) throw new Error(`RISK_PROFILE_UNKNOWN:${profile}`);
  }
  for (const profile of addProfiles) selected.add(profile);
  const removed = [...new Set(removeProfiles)].filter((profile) => selected.has(profile));
  if (removed.length && String(reason).trim().length < 12) throw new Error('RISK_REDUCTION_REQUIRES_JUSTIFICATION');
  for (const profile of removed) selected.delete(profile);
  if (!selected.size) throw new Error('RISK_NO_PROFILES');
  const profiles = RISK_PROFILE_ORDER.filter((profile) => selected.has(profile));
  const domains = gatesForFiles(normalized).map(({ id, severity }) => ({ id, severity }));
  const critical = checks.some((item) => item.profiles.some((profile) => ['database', 'financial', 'security'].includes(profile)));
  return {
    schemaVersion: 667, files: normalized, profiles, critical,
    domains, matches: checks,
    override: { added: [...new Set(addProfiles)].sort(), removed, reason: removed.length ? String(reason).trim() : '', requiresReview: removed.length > 0 },
  };
}
