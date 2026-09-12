import { prisma } from '../../database/prisma.js';
import { raceProviderStatus } from '../hipico-bot/hipico-race-provider.js';
import { buildHipicoSystemStatus } from './hipico-system.service.js';

export type CommandCenterScope = { ownerId: string; groupKey: string };
type CountRow = { state: string; count: bigint | number };
type ScalarCount = { count: bigint | number };

const count = (value: bigint | number | null | undefined) => Number(value || 0);

async function optional<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try { return await work(); }
  catch { return fallback; }
}

function stateCounts(rows: CountRow[]) {
  return Object.fromEntries(rows.map((row) => [String(row.state || 'unknown').toLowerCase(), count(row.count)]));
}

export async function buildHipicoCommandCenter(scope: CommandCenterScope) {
  const [system, channelRows, queueRows, shadowRows, documentRows, reconciliationRows, raceRows] = await Promise.all([
    buildHipicoSystemStatus(),
    optional(() => prisma.$queryRaw<Array<{ groupKey: string; label: string; channelType: string; status: string; updatedAt: Date | string }>>`
      SELECT group_key AS "groupKey",label,channel_type AS "channelType",status,updated_at AS "updatedAt"
      FROM public.hipico_bot_channels
      WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey}
      ORDER BY updated_at DESC LIMIT 1
    `, []),
    optional(() => prisma.$queryRaw<CountRow[]>`
      SELECT status AS state,COUNT(*)::bigint AS count
      FROM public.hipico_outbox
      WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey}
      GROUP BY status
    `, []),
    optional(() => prisma.$queryRaw<CountRow[]>`
      SELECT match_status AS state,COUNT(*)::bigint AS count
      FROM public.hipico_shadow_evaluations
      WHERE owner_id=${scope.ownerId}::uuid AND source_group_key=${scope.groupKey}
      GROUP BY match_status
    `, []),
    optional(() => prisma.$queryRaw<CountRow[]>`
      SELECT status AS state,COUNT(*)::bigint AS count
      FROM public.hipico_documents
      WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey}
      GROUP BY status
    `, []),
    optional(() => prisma.$queryRaw<ScalarCount[]>`
      SELECT COUNT(*)::bigint AS count
      FROM public.hipico_reconciliations
      WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey} AND status IN ('pending','difference')
    `, []),
    optional(() => prisma.$queryRaw<CountRow[]>`
      SELECT status AS state,COUNT(*)::bigint AS count
      FROM public.hipico_domain_aggregates
      WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey} AND aggregate_kind='race'
      GROUP BY status
    `, [])
  ]);

  const queue = stateCounts(queueRows);
  const shadow = stateCounts(shadowRows);
  const documents = stateCounts(documentRows);
  const races = stateCounts(raceRows);
  const queueTotal = Object.values(queue).reduce((sum, value) => sum + Number(value || 0), 0);
  const queuePending = Number(queue.queued || 0) + Number(queue.sending || 0) + Number(queue.retry || 0) + Number(queue.pending_approval || 0);
  const queueFailed = Number(queue.failed || 0);
  const reconciliationRequired = Number(queue.reconciliation_required || 0) + count(reconciliationRows[0]?.count);
  const shadowTotal = Object.values(shadow).reduce((sum, value) => sum + Number(value || 0), 0);
  const documentTotal = Object.values(documents).reduce((sum, value) => sum + Number(value || 0), 0);
  const channel = channelRows[0] || null;
  const provider = raceProviderStatus(process.env);
  const promotion = String(process.env.HIPICO_BOT_PROMOTION || 'shadow').trim().toLowerCase() || 'shadow';
  const bridgeReady = system.components.bridge.state === 'ready';
  const alerts: string[] = [];

  if (system.components.backend.state !== 'ready') alerts.push('BACKEND_NOT_READY');
  if (system.components.database.state !== 'ready') alerts.push('DATABASE_NOT_READY');
  if (!bridgeReady) alerts.push('BRIDGE_NOT_READY');
  if (!channel) alerts.push('CHANNEL_NOT_REGISTERED');
  if (queueFailed > 0) alerts.push('OUTBOX_FAILED');
  if (queuePending > 0) alerts.push('OUTBOX_PENDING');
  if (reconciliationRequired > 0) alerts.push('RECONCILIATION_REQUIRED');
  if (Number(documents.review || 0) > 0) alerts.push('DOCUMENT_REVIEW_PENDING');
  if (Number(documents.failed || 0) > 0) alerts.push('DOCUMENT_FAILED');
  if (provider.circuitState === 'open') alerts.push('PROVIDER_CIRCUIT_OPEN');
  if ((Number(races.open || 0) + Number(races.closed || 0) + Number(races.result_received || 0)) > 1) alerts.push('RACE_CONTEXT_REQUIRES_REVIEW');

  return {
    sampledAt: new Date().toISOString(),
    scope: { groupKey: scope.groupKey },
    version: system.version,
    system: {
      state: system.ok ? 'ready' : system.components.database.state === 'unavailable' ? 'unavailable' : 'degraded',
      backendReachable: system.components.backend.state === 'ready',
      components: system.components
    },
    bridge: {
      state: bridgeReady ? 'ready' : 'not_ready',
      ready: bridgeReady,
      sourceSendPossible: false
    },
    channel: {
      state: channel ? String(channel.status || 'known') : 'unknown',
      groupAutomation: channel?.channelType || 'unknown',
      qaMode: promotion === 'automatic' ? 'automatic' : 'shadow-only',
      label: channel?.label || null,
      updatedAt: channel?.updatedAt || null
    },
    database: { state: system.components.database.state, ready: system.components.database.state === 'ready' },
    providers: {
      state: provider.configured ? (provider.circuitState === 'open' ? 'degraded' : 'ready') : 'disabled',
      provider: provider.provider,
      configured: provider.configured,
      enrichmentOnly: true,
      financialAuthority: false,
      circuitState: provider.circuitState,
      retryAfterMs: provider.retryAfterMs
    },
    agent: {
      state: shadowTotal > 0 ? 'known' : 'unknown',
      mode: promotion,
      shadowOnly: promotion !== 'automatic',
      evaluations: { available: shadowTotal > 0, total: shadowTotal, pending: Number(shadow.pending || 0), matched: Number(shadow.matched || 0) + Number(shadow.equivalent || 0), unsafe: Number(shadow.unsafe || 0) }
    },
    documents: { state: documentTotal > 0 ? 'known' : system.components.documentEngine.state, total: documentTotal, states: documents },
    queue: { available: true, total: queueTotal, pending: queuePending, failed: queueFailed, states: queue },
    conflicts: { reconciliationRequired },
    races: { total: Object.values(races).reduce((sum, value) => sum + Number(value || 0), 0), states: races },
    alerts
  };
}
