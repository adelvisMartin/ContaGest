import { prisma } from '../../database/prisma.js';
import { raceProviderStatus, type HorseRaceProviderStatus } from '../hipico-bot/hipico-race-provider.js';
import { buildHipicoSystemStatus } from './hipico-system.service.js';

export type CommandCenterScope = { ownerId: string; groupKey: string };
type CountRow = { state: string; count: bigint | number };
type ScalarCount = { count: bigint | number };
type ChannelRow = { groupKey: string; label: string; channelType: string; status: string; updatedAt: Date | string };
type SystemStatus = Awaited<ReturnType<typeof buildHipicoSystemStatus>>;

export type CommandCenterProbe<T> = { available: boolean; value: T };

const count = (value: bigint | number | null | undefined) => Number(value || 0);

async function probe<T>(work: () => Promise<T>, fallback: T): Promise<CommandCenterProbe<T>> {
  try { return { available: true, value: await work() }; }
  catch { return { available: false, value: fallback }; }
}

function stateCounts(rows: CountRow[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [String(row.state || 'unknown').toLowerCase(), count(row.count)]));
}

function totalStates(states: Record<string, number>) {
  return Object.values(states).reduce((sum, value) => sum + Number(value || 0), 0);
}

export function projectHipicoCommandCenter(input: {
  scope: CommandCenterScope;
  system: SystemStatus;
  provider: HorseRaceProviderStatus;
  promotion: string;
  sampledAt: string;
  probes: {
    channel: CommandCenterProbe<ChannelRow[]>;
    queue: CommandCenterProbe<CountRow[]>;
    shadow: CommandCenterProbe<CountRow[]>;
    documents: CommandCenterProbe<CountRow[]>;
    reconciliation: CommandCenterProbe<ScalarCount[]>;
    races: CommandCenterProbe<CountRow[]>;
  };
}) {
  const { scope, system, provider, promotion, sampledAt, probes } = input;
  const queue = stateCounts(probes.queue.value);
  const shadow = stateCounts(probes.shadow.value);
  const documents = stateCounts(probes.documents.value);
  const races = stateCounts(probes.races.value);
  const queueTotal = totalStates(queue);
  const queuePending = Number(queue.queued || 0) + Number(queue.sending || 0) + Number(queue.retry || 0) + Number(queue.pending_approval || 0);
  const queueFailed = Number(queue.failed || 0);
  const reconciliationRequired = probes.queue.available && probes.reconciliation.available
    ? Number(queue.reconciliation_required || 0) + count(probes.reconciliation.value[0]?.count)
    : null;
  const shadowTotal = totalStates(shadow);
  const documentTotal = totalStates(documents);
  const raceTotal = totalStates(races);
  const channel = probes.channel.value[0] || null;
  const bridgeReady = system.components.bridge.state === 'ready';
  const alerts: string[] = [];

  if (system.components.backend.state !== 'ready') alerts.push('BACKEND_NOT_READY');
  if (system.components.database.state !== 'ready') alerts.push('DATABASE_NOT_READY');
  if (!bridgeReady) alerts.push('BRIDGE_NOT_READY');
  if (!probes.channel.available) alerts.push('CHANNEL_READ_UNAVAILABLE');
  else if (!channel) alerts.push('CHANNEL_NOT_REGISTERED');
  if (!probes.queue.available) alerts.push('OUTBOX_READ_UNAVAILABLE');
  else {
    if (queueFailed > 0) alerts.push('OUTBOX_FAILED');
    if (queuePending > 0) alerts.push('OUTBOX_PENDING');
  }
  if (!probes.shadow.available) alerts.push('SHADOW_READ_UNAVAILABLE');
  if (!probes.documents.available) alerts.push('DOCUMENT_READ_UNAVAILABLE');
  else {
    if (Number(documents.review || 0) > 0) alerts.push('DOCUMENT_REVIEW_PENDING');
    if (Number(documents.failed || 0) > 0) alerts.push('DOCUMENT_FAILED');
  }
  if (!probes.reconciliation.available) alerts.push('RECONCILIATION_READ_UNAVAILABLE');
  else if (reconciliationRequired !== null && reconciliationRequired > 0) alerts.push('RECONCILIATION_REQUIRED');
  if (!probes.races.available) alerts.push('RACE_READ_UNAVAILABLE');
  else if ((Number(races.open || 0) + Number(races.closed || 0) + Number(races.result_received || 0)) > 1) alerts.push('RACE_CONTEXT_REQUIRES_REVIEW');

  return {
    sampledAt,
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
      available: probes.channel.available,
      state: !probes.channel.available ? 'unavailable' : channel ? String(channel.status || 'known') : 'unknown',
      groupAutomation: channel?.channelType || 'unknown',
      qaMode: promotion === 'automatic' ? 'automatic' : 'shadow-only',
      label: channel?.label || null,
      updatedAt: channel?.updatedAt || null
    },
    database: { state: system.components.database.state, ready: system.components.database.state === 'ready' },
    providers: {
      state: provider.configured ? 'ready' : 'disabled',
      provider: provider.provider,
      configured: provider.configured,
      enrichmentOnly: true,
      financialAuthority: false,
      runtimeTelemetryAvailable: false,
      circuitState: 'not_exposed',
      retryAfterMs: null,
      reason: provider.reason
    },
    agent: {
      state: probes.shadow.available ? system.components.agent.state : 'unavailable',
      mode: promotion,
      shadowOnly: promotion !== 'automatic',
      evaluations: {
        available: probes.shadow.available,
        total: probes.shadow.available ? shadowTotal : null,
        pending: probes.shadow.available ? Number(shadow.pending || 0) : null,
        matched: probes.shadow.available ? Number(shadow.matched || 0) + Number(shadow.equivalent || 0) : null,
        unsafe: probes.shadow.available ? Number(shadow.unsafe || 0) : null
      }
    },
    documents: {
      available: probes.documents.available,
      state: !probes.documents.available ? 'unavailable' : documentTotal > 0 ? 'known' : system.components.documentEngine.state,
      total: probes.documents.available ? documentTotal : null,
      states: documents
    },
    queue: {
      available: probes.queue.available,
      state: !probes.queue.available ? 'unavailable' : queueFailed > 0 || queuePending > 0 ? 'degraded' : 'ready',
      total: probes.queue.available ? queueTotal : null,
      pending: probes.queue.available ? queuePending : null,
      failed: probes.queue.available ? queueFailed : null,
      states: queue
    },
    conflicts: {
      available: probes.queue.available && probes.reconciliation.available,
      state: !(probes.queue.available && probes.reconciliation.available) ? 'unavailable' : Number(reconciliationRequired || 0) > 0 ? 'degraded' : 'ready',
      reconciliationRequired
    },
    races: {
      available: probes.races.available,
      state: probes.races.available ? 'ready' : 'unavailable',
      total: probes.races.available ? raceTotal : null,
      states: races
    },
    alerts
  };
}

export async function buildHipicoCommandCenter(scope: CommandCenterScope) {
  const [system, channel, queue, shadow, documents, reconciliation, races] = await Promise.all([
    buildHipicoSystemStatus(),
    probe(() => prisma.$queryRaw<ChannelRow[]>`
      SELECT group_key AS "groupKey",label,channel_type AS "channelType",status,updated_at AS "updatedAt"
      FROM public.hipico_bot_channels
      WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey}
      ORDER BY updated_at DESC LIMIT 1
    `, []),
    probe(() => prisma.$queryRaw<CountRow[]>`
      SELECT status AS state,COUNT(*)::bigint AS count
      FROM public.hipico_outbox
      WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey}
      GROUP BY status
    `, []),
    probe(() => prisma.$queryRaw<CountRow[]>`
      SELECT match_status AS state,COUNT(*)::bigint AS count
      FROM public.hipico_shadow_evaluations
      WHERE owner_id=${scope.ownerId}::uuid AND source_group_key=${scope.groupKey}
      GROUP BY match_status
    `, []),
    probe(() => prisma.$queryRaw<CountRow[]>`
      SELECT status AS state,COUNT(*)::bigint AS count
      FROM public.hipico_documents
      WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey}
      GROUP BY status
    `, []),
    probe(() => prisma.$queryRaw<ScalarCount[]>`
      SELECT COUNT(*)::bigint AS count
      FROM public.hipico_reconciliations
      WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey} AND status IN ('pending','difference')
    `, []),
    probe(() => prisma.$queryRaw<CountRow[]>`
      SELECT status AS state,COUNT(*)::bigint AS count
      FROM public.hipico_domain_aggregates
      WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey} AND aggregate_kind='race'
      GROUP BY status
    `, [])
  ]);

  return projectHipicoCommandCenter({
    scope,
    system,
    provider: raceProviderStatus(process.env),
    promotion: String(process.env.HIPICO_BOT_PROMOTION || 'shadow').trim().toLowerCase() || 'shadow',
    sampledAt: new Date().toISOString(),
    probes: { channel, queue, shadow, documents, reconciliation, races }
  });
}
