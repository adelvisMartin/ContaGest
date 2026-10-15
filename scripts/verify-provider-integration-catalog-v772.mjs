import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const catalogPath = fileURLToPath(new URL('../config/provider-integration-catalog-v772.json', import.meta.url));
export const readCatalog = () => JSON.parse(readFileSync(catalogPath, 'utf8'));

const decisions = new Set(['CONSUME_EXTERNAL_API','IMPLEMENT_INTERNAL_EQUIVALENT','NOT_APPLICABLE']);
const statuses = new Set(['CANDIDATE','UNVERIFIED']);
const costKinds = new Set(['SELF_HOST_PREFERRED','PLAN_RESTRICTED_CLOUD_API','LICENSE_REVIEW_REQUIRED','SELF_HOST_WITH_LICENSE_REVIEW','UNKNOWN']);
const priorityKinds = new Set(['P0','P1','P2']);
const requiredRedactions = ['authorization','cookie','set-cookie','password','apiKey','apiSecret','webhookSignature','personalData','rawBody'];

function validSource(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname ||
      /(^|[.])(localhost|local|internal)$/.test(url.hostname) ||
      /^\d+(?:\.\d+){3}$/.test(url.hostname) ||
      /(?:api[_-]?key|token|secret|password|signature)=/i.test(url.search)) return false;
    return true;
  } catch { return false; }
}

export function validateCatalog(data) {
  const errors = [];
  const requireTrue = (condition, code) => { if (!condition) errors.push(code); };
  requireTrue(data?.schemaVersion === 1, 'SCHEMA_VERSION');
  requireTrue(data?.sourceReuse === 'NONE', 'SOURCE_REUSE');
  requireTrue(data?.runtimeEnabled === false && data?.status === 'RESEARCH_ONLY', 'RUNTIME_MUST_REMAIN_DISABLED');
  requireTrue(/^[a-f0-9]{40}$/.test(data?.baselineSha ?? ''), 'BASELINE_SHA');
  requireTrue(data?.ownership?.issue === 772 && typeof data?.ownership?.apiContract === 'string', 'CONTRACT_AUTHORITY');
  const c = data?.contract;
  requireTrue(c?.version === 'integration-port-v1', 'CONTRACT_VERSION');
  const i = c?.identity;
  requireTrue(i?.tenantFromAuthenticatedServer === true &&
    i?.rolePermissionCheck === 'server' &&
    i?.connectionScopedToTenant === true &&
    i?.correlationIdRequired === true &&
    i?.credentialStorage === 'server-side-secret-reference' &&
    i?.noBrowserCredentials === true, 'TENANT_SECURITY');
  const n = c?.network;
  requireTrue(n?.httpsOnly === true && n?.hostAllowlistPerConnection === true &&
    n?.blockPrivateAddresses === true && n?.preventRedirectToUnapprovedHost === true &&
    Number.isInteger(n?.connectTimeoutMs) && n.connectTimeoutMs >= 500 && n.connectTimeoutMs <= 10000 &&
    Number.isInteger(n?.requestTimeoutMs) && n.requestTimeoutMs >= n.connectTimeoutMs && n.requestTimeoutMs <= 30000 &&
    Number.isInteger(n?.maxResponseBytes) && n.maxResponseBytes > 0 && n.maxResponseBytes <= 5_242_880, 'NETWORK_BOUNDS');
  const d = c?.delivery;
  requireTrue(Number.isInteger(d?.maxAttempts) && d.maxAttempts >= 1 && d.maxAttempts <= 5 &&
    d?.backoff === 'bounded-exponential-jitter' &&
    d?.retryNonIdempotentWithoutProviderDedupe === false &&
    d?.idempotencyScope === 'tenant+connection+operation+external-event' &&
    d?.inboxDeduplication === 'durable' &&
    d?.outboxRequiredForSideEffects === true &&
    d?.deadLetterQueue === true && d?.reconciliationRequired === true, 'RETRY_IDEMPOTENCY');
  const w = c?.webhooks;
  requireTrue(w?.signedRawBodyRequired === true &&
    Number.isInteger(w?.maxClockSkewSeconds) && w.maxClockSkewSeconds > 0 && w.maxClockSkewSeconds <= 300 &&
    w?.durableNonceOrEventId === true && w?.failClosedOnInvalidSignature === true &&
    w?.tenantResolvedFromRegisteredConnection === true && w?.neverFromPayload === true, 'WEBHOOK_REPLAY_AND_TENANT');
  const o = c?.observability;
  requireTrue(o?.noSecretsInLogs === true && o?.correlationIdRequired === true &&
    requiredRedactions.every(v => o?.redact?.includes(v)), 'SECRET_REDACTION');
  requireTrue(c?.availability?.selfHostPreferred === true && c?.availability?.paidMandatory === false, 'FREE_FIRST');
  requireTrue(c?.apiContractAuthority === '#652/#565', 'API_CONTRACT_OWNER');
  requireTrue(Array.isArray(data?.providers) && data.providers.length >= 6, 'PROVIDERS');
  const ids = new Set();
  for (const [index, p] of (Array.isArray(data?.providers) ? data.providers : []).entries()) {
    const pre = 'PROVIDER_' + index + '_';
    requireTrue(typeof p?.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(p.id) && !ids.has(p.id), pre + 'UNIQUE_ID');
    if (typeof p?.id === 'string') ids.add(p.id);
    requireTrue(typeof p?.name === 'string' && p.name.trim().length > 2, pre + 'NAME');
    requireTrue(decisions.has(p?.decision) && statuses.has(p?.status), pre + 'DECISION');
    requireTrue(p?.enabled === false, pre + 'DISABLED');
    requireTrue(validSource(p?.source) && validSource(p?.licenseSource), pre + 'HTTPS_PROVENANCE');
    requireTrue(typeof p?.license === 'string' && p.license.length >= 3 &&
      typeof p?.auth === 'string' && p.auth.length >= 3 &&
      typeof p?.useCase === 'string' && p.useCase.length > 12 &&
      typeof p?.rateLimits === 'string' && p.rateLimits.length > 4, pre + 'EVIDENCE');
    requireTrue(costKinds.has(p?.cost) && priorityKinds.has(p?.priority) &&
      Number.isInteger(p?.issueOwner) && p.issueOwner > 0, pre + 'BACKLOG_OWNER');
    requireTrue(p?.decision === 'NOT_APPLICABLE' ||
      (p?.status === 'CANDIDATE' && typeof p?.documentedApi === 'string' && p.documentedApi.startsWith('/')),
      pre + 'DOCUMENTED_API');
    requireTrue(p?.decision !== 'NOT_APPLICABLE' || (p?.status === 'UNVERIFIED' && p?.documentedApi === null),
      pre + 'UNVERIFIED_MUST_FAIL_CLOSED');
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const issues = validateCatalog(readCatalog());
    if (issues.length) { process.stderr.write(issues.join('\n') + '\n'); process.exitCode = 1; }
    else { process.stdout.write('PASS #772: provider catalog, provenance, tenant/auth/network/replay guardrails\n'); }
  } catch (error) {
    process.stderr.write('CATALOG_PARSE_OR_IO_FAILURE: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
