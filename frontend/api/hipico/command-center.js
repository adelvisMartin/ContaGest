import { hipicoPersistenceConfig, strongSecretConfigured } from './_shared.js';
import { bridgeIdentityStatus } from './bridge-identity.js';
import { proxyCanonicalRequest } from './canonical-backend.js';

const MAX_BACKEND_JSON_BYTES = 256 * 1024;
const OUTBOX_SAMPLE_LIMIT = 100;
const SHADOW_SAMPLE_LIMIT = 100;

function configuredOperatorToken(source = process.env) {
  const primary = String(source.HIPICO_OPERATOR_CONTROL_TOKEN || '').trim();
  if (strongSecretConfigured(primary)) return primary;
  const legacy = String(source.HIPICO_BOT_OPERATOR_TOKEN || '').trim();
  return strongSecretConfigured(legacy) ? legacy : '';
}

function bridgeReadiness(source = process.env) {
  const identity = bridgeIdentityStatus(source);
  const persistence = hipicoPersistenceConfig(source);
  const tokenStrong = strongSecretConfigured(source.HIPICO_GROUP_BRIDGE_TOKEN);
  return {
    ready: Boolean(identity.ready && persistence.ready && tokenStrong),
    tokenStrong,
    identityReady: identity.ready,
    persistenceReady: persistence.ready
  };
}

async function readBoundedJson(response) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BACKEND_JSON_BYTES) throw new Error('HIPICO_COMMAND_CENTER_RESPONSE_TOO_LARGE');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BACKEND_JSON_BYTES) throw new Error('HIPICO_COMMAND_CENTER_RESPONSE_TOO_LARGE');
  return JSON.parse(bytes.toString('utf8'));
}

async function backendJson(path, operatorToken, source = process.env) {
  try {
    const response = await proxyCanonicalRequest({
      path,
      method: 'GET',
      headers: { 'x-hipico-operator-token': operatorToken, accept: 'application/json' },
      source
    });
    if (!response.ok) return { ok: false, httpStatus: response.status, data: null };
    const payload = await readBoundedJson(response);
    return { ok: payload?.ok !== false, httpStatus: response.status, data: payload?.data ?? null };
  } catch {
    return { ok: false, httpStatus: null, data: null };
  }
}

function outboxProjection(result) {
  const rows = result?.ok && Array.isArray(result.data) ? result.data : [];
  const statuses = Object.create(null);
  for (const row of rows) {
    const status = String(row?.status || 'unknown').trim().toLowerCase() || 'unknown';
    statuses[status] = Number(statuses[status] || 0) + 1;
  }
  return {
    available: Boolean(result?.ok),
    total: rows.length,
    pendingApproval: Number(statuses.pending_approval || 0),
    queued: Number(statuses.queued || 0) + Number(statuses.retry || 0),
    sending: Number(statuses.sending || 0),
    failed: Number(statuses.failed || 0),
    reconciliationRequired: Number(statuses.reconciliation_required || 0)
  };
}

function shadowProjection(result) {
  if (!result?.ok) return { available: false, pending: 0, matched: 0, total: 0 };
  const data = result.data;
  if (Array.isArray(data)) return { available: true, pending: data.filter((item) => String(item?.matchStatus || item?.match_status || '') === 'pending').length, matched: data.filter((item) => String(item?.matchStatus || item?.match_status || '') === 'matched').length, total: data.length };
  const counts = data?.counts && typeof data.counts === 'object' ? data.counts : {};
  const total = Number(data?.total ?? Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0));
  return { available: true, pending: Number(counts.pending || 0), matched: Number(counts.matched || 0), total: Number.isFinite(total) ? total : 0 };
}

function providerProjection(provider) {
  const source = provider && typeof provider === 'object' ? provider : {};
  return {
    state: source.configured === true ? (String(source.circuitState || 'closed') === 'open' ? 'degraded' : 'ready') : 'disabled',
    provider: String(source.provider || 'disabled'),
    configured: source.configured === true,
    enrichmentOnly: source.enrichmentOnly !== false,
    financialAuthority: false,
    circuitState: String(source.circuitState || 'unknown'),
    retryAfterMs: Math.max(0, Number(source.retryAfterMs || 0))
  };
}

export function projectCommandCenter({ backendStatus, outbox, shadow, bridge, sampledAt = new Date().toISOString() } = {}) {
  const status = backendStatus?.ok && backendStatus.data && typeof backendStatus.data === 'object' ? backendStatus.data : null;
  const queue = outboxProjection(outbox);
  const shadowState = shadowProjection(shadow);
  const provider = providerProjection(status?.raceProvider);
  const backendReachable = Boolean(backendStatus?.ok && status);
  const databaseReady = Boolean(status?.dbReady);
  const bridgeReady = Boolean(bridge?.ready);
  const agentMode = String(status?.promotion?.mode || status?.promotion?.state || status?.groupQaMode || 'unknown');
  const alerts = [];
  if (!backendReachable) alerts.push('BACKEND_UNAVAILABLE');
  if (backendReachable && !databaseReady) alerts.push('DATABASE_UNAVAILABLE');
  if (!bridgeReady) alerts.push('BRIDGE_NOT_READY');
  if (queue.reconciliationRequired > 0) alerts.push('OUTBOX_RECONCILIATION_REQUIRED');
  if (provider.circuitState === 'open') alerts.push('PROVIDER_CIRCUIT_OPEN');

  return {
    sampledAt,
    system: { state: backendReachable && databaseReady ? 'ready' : backendReachable ? 'degraded' : 'unavailable', backendReachable },
    bridge: { state: bridgeReady ? 'ready' : 'not_ready', ready: bridgeReady, identityReady: Boolean(bridge?.identityReady), persistenceReady: Boolean(bridge?.persistenceReady) },
    channel: { state: status ? 'known' : 'unknown', groupAutomation: String(status?.groupAutomation || 'unknown'), qaMode: String(status?.groupQaMode || 'unknown'), targetSupport: Array.isArray(status?.targetSupport) ? status.targetSupport.map(String).slice(0, 8) : [] },
    database: { state: backendReachable ? (databaseReady ? 'ready' : 'unavailable') : 'unknown', ready: databaseReady },
    providers: provider,
    agent: { state: shadowState.available ? 'known' : 'unknown', mode: agentMode, shadowOnly: String(status?.groupQaMode || '').toLowerCase() === 'shadow-only' || agentMode.toLowerCase().includes('shadow'), evaluations: shadowState },
    documents: { state: 'not_exposed', reason: 'DOCUMENT_CAPABILITY_NOT_EXPOSED_BY_CURRENT_BACKEND' },
    queue: { available: queue.available, total: queue.total, pendingApproval: queue.pendingApproval, queued: queue.queued, sending: queue.sending, failed: queue.failed },
    conflicts: { reconciliationRequired: queue.reconciliationRequired },
    alerts
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const token = configuredOperatorToken();
  if (!token) return res.status(503).json({ ok: false, retryable: false, error: 'operator_read_model_not_configured' });

  const [backendStatus, outbox, shadow] = await Promise.all([
    backendJson('/api/v1/hipico-bot/status', token),
    backendJson(`/api/v1/hipico-bot/outbox?limit=${OUTBOX_SAMPLE_LIMIT}`, token),
    backendJson(`/api/v1/hipico-bot/shadow-projection?limit=${SHADOW_SAMPLE_LIMIT}`, token)
  ]);
  const data = projectCommandCenter({ backendStatus, outbox, shadow, bridge: bridgeReadiness() });
  return res.status(200).json({ ok: true, data });
}

export const __test__ = { configuredOperatorToken, bridgeReadiness, outboxProjection, shadowProjection, providerProjection, readBoundedJson, backendJson };
