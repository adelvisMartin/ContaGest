import { prisma } from '../../database/prisma.js';
import { buildHipicoSystemStatus } from './hipico-system.service.js';
import { createDefaultRacingProviderRegistry } from './provider-registry.js';
import { PostgresDocumentStore } from './document.store.js';
import { RaceLifecycleStore } from './race.store.js';
import { AutomationStore } from './automation.store.js';

export type CommandCenterScope = {
  ownerId: string;
  groupKey: string;
  groupId?: string | null;
};

type CountRow = { count: bigint | number };
type StateCountRow = { state: string; count: bigint | number };

const raceStore = new RaceLifecycleStore();
const documentStore = new PostgresDocumentStore();
const automationStore = new AutomationStore();
const providers = createDefaultRacingProviderRegistry();

function asCount(value: bigint | number | null | undefined) {
  return Number(value || 0);
}

async function optional<T>(fn: () => Promise<T>, fallback: T) {
  try { return await fn(); }
  catch { return fallback; }
}

function firstCurrentRace(races: any[]) {
  const priority = ['OPEN', 'CLOSING', 'RUNNING', 'CLOSED', 'PROVISIONAL_RESULT'];
  for (const state of priority) {
    const found = races.find((race) => race.state === state);
    if (found) return found;
  }
  return null;
}

function nextRace(races: any[]) {
  return [...races]
    .filter((race) => ['DISCOVERED', 'ANNOUNCED', 'POSTPONED'].includes(race.state))
    .sort((a, b) => Date.parse(a.scheduledAt || '9999-12-31') - Date.parse(b.scheduledAt || '9999-12-31'))[0] || null;
}

function stateMap(rows: StateCountRow[]) {
  return Object.fromEntries(rows.map((row) => [row.state, asCount(row.count)]));
}

export async function buildHipicoCommandCenter(scope: CommandCenterScope) {
  const now = new Date();
  const [system, meetings, races, documents, providerStatus, channels, queueRows, documentRows, conflictRows, lastBridgeRows] = await Promise.all([
    buildHipicoSystemStatus(),
    raceStore.listMeetings(scope.ownerId, scope.groupKey, 30),
    raceStore.listRaces(scope.ownerId, scope.groupKey, null, 200),
    documentStore.list(scope.ownerId, scope.groupKey, 20),
    optional(() => providers.status(), [] as any[]),
    optional(() => prisma.$queryRaw<any[]>`
      SELECT group_key AS "groupKey", label, channel_type AS "channelType", status,
             config->>'mode' AS mode, config->>'purpose' AS purpose, updated_at AS "updatedAt"
      FROM public.hipico_bot_channels
      WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey}
      ORDER BY updated_at DESC
      LIMIT 50
    `, []),
    optional(() => prisma.$queryRaw<StateCountRow[]>`
      SELECT status AS state, COUNT(*)::bigint AS count
      FROM public.hipico_outbox
      WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey}
      GROUP BY status
    `, []),
    optional(() => prisma.$queryRaw<StateCountRow[]>`
      SELECT status AS state, COUNT(*)::bigint AS count
      FROM public.hipico_documents
      WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey}
      GROUP BY status
    `, []),
    optional(async () => {
      const [reconciliations, rejectedTransitions, agentConflicts] = await Promise.all([
        prisma.$queryRaw<CountRow[]>`
          SELECT COUNT(*)::bigint AS count FROM public.hipico_reconciliations
          WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey} AND status IN ('difference','pending')
        `,
        prisma.$queryRaw<CountRow[]>`
          SELECT COUNT(*)::bigint AS count FROM public.hipico_race_events
          WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey} AND disposition='rejected'
        `,
        scope.groupId ? prisma.$queryRaw<CountRow[]>`
          SELECT COUNT(*)::bigint AS count FROM public.hipico_agent_evaluations
          WHERE owner_id=${scope.ownerId}::uuid AND group_key=${scope.groupKey} AND group_id=${scope.groupId} AND conflict=true
        ` : Promise.resolve([{ count: 0 }])
      ]);
      return {
        reconciliations: asCount(reconciliations[0]?.count),
        rejectedTransitions: asCount(rejectedTransitions[0]?.count),
        agentConflicts: asCount(agentConflicts[0]?.count)
      };
    }, { reconciliations: 0, rejectedTransitions: 0, agentConflicts: 0 }),
    optional(() => prisma.$queryRaw<Array<{ createdAt: Date | string }>>`
      SELECT created_at AS "createdAt"
      FROM public.hipico_messages
      WHERE owner_id=${scope.ownerId}::uuid
        AND channel_key=${scope.groupKey}
        AND metadata->>'source' IN ('official_web_playwright','whatsapp-web-bridge')
      ORDER BY created_at DESC
      LIMIT 1
    `, [])
  ]);

  const currentRace = firstCurrentRace(races);
  const upcomingRace = nextRace(races);
  const activeMeeting = currentRace
    ? meetings.find((meeting: any) => meeting.id === currentRace.meetingId) || null
    : meetings[0] || null;
  const queue = stateMap(queueRows);
  const documentStates = stateMap(documentRows);
  const queuePending = (queue.queued || 0) + (queue.sending || 0) + (queue.retry || 0);
  const queueFailed = queue.failed || 0;
  const conflicts = conflictRows.reconciliations + conflictRows.rejectedTransitions + conflictRows.agentConflicts;

  let agent: any = {
    state: 'not_configured',
    reason: scope.groupId ? 'AGENT_STATE_UNAVAILABLE' : 'GROUP_ID_NOT_SELECTED',
    mode: null,
    metrics: null
  };
  if (scope.groupId) {
    agent = await optional(async () => {
      const [config, metrics] = await Promise.all([
        automationStore.get(scope.ownerId, scope.groupKey, scope.groupId!),
        automationStore.metrics(scope.ownerId, scope.groupKey, scope.groupId!)
      ]);
      return { state: 'ready', reason: null, mode: config?.mode || 'DISABLED', metrics };
    }, agent);
  }

  const lastBridgeAt = lastBridgeRows[0]?.createdAt ? new Date(lastBridgeRows[0].createdAt) : null;
  const bridgeAgeMs = lastBridgeAt ? Math.max(0, now.getTime() - lastBridgeAt.getTime()) : null;
  const bridgeConfigured = system.components.bridge.state === 'ready';
  const bridgeRuntimeState = !bridgeConfigured
    ? 'not_configured'
    : bridgeAgeMs == null
      ? 'degraded'
      : bridgeAgeMs <= 2 * 60 * 1000
        ? 'ready'
        : 'degraded';

  const alerts: Array<{ severity: 'info' | 'warning' | 'critical'; code: string; message: string }> = [];
  for (const [component, value] of Object.entries(system.components)) {
    if ((value as any).state === 'unavailable') alerts.push({ severity: 'critical', code: `COMPONENT_${component.toUpperCase()}_UNAVAILABLE`, message: `${component} no está disponible.` });
    else if ((value as any).state === 'degraded') alerts.push({ severity: 'warning', code: `COMPONENT_${component.toUpperCase()}_DEGRADED`, message: `${component} está degradado.` });
  }
  if (bridgeConfigured && bridgeAgeMs == null) alerts.push({ severity: 'warning', code: 'BRIDGE_NO_EVENTS', message: 'Bridge configurado sin eventos persistidos todavía.' });
  else if (bridgeAgeMs != null && bridgeAgeMs > 2 * 60 * 1000) alerts.push({ severity: 'warning', code: 'BRIDGE_STALE', message: 'El último evento del Bridge supera dos minutos.' });
  if (queueFailed > 0) alerts.push({ severity: 'critical', code: 'OUTBOX_FAILED', message: `${queueFailed} elemento(s) de cola fallaron.` });
  if (queuePending > 0) alerts.push({ severity: 'warning', code: 'OUTBOX_PENDING', message: `${queuePending} elemento(s) siguen pendientes o en reintento.` });
  if (conflicts > 0) alerts.push({ severity: 'warning', code: 'OPERATION_CONFLICTS', message: `${conflicts} conflicto(s) requieren revisión.` });
  if ((documentStates.review || 0) > 0) alerts.push({ severity: 'warning', code: 'DOCUMENT_REVIEW_PENDING', message: `${documentStates.review} documento(s) requieren revisión.` });
  if ((documentStates.failed || 0) > 0) alerts.push({ severity: 'critical', code: 'DOCUMENT_FAILED', message: `${documentStates.failed} documento(s) fallaron al procesarse.` });
  if (!currentRace) alerts.push({ severity: 'info', code: 'NO_ACTIVE_RACE', message: 'No hay una carrera operativa activa en este grupo.' });

  return {
    generatedAt: now.toISOString(),
    scope: { groupKey: scope.groupKey, groupId: scope.groupId || null },
    version: system.version,
    system: {
      ok: system.ok,
      components: system.components
    },
    bridge: {
      state: bridgeRuntimeState,
      configuredState: system.components.bridge.state,
      lastEventAt: lastBridgeAt?.toISOString() || null,
      ageMs: bridgeAgeMs,
      sourceSendPossible: false
    },
    channels: channels.map((channel) => ({
      groupKey: channel.groupKey,
      label: channel.label,
      channelType: channel.channelType,
      status: channel.status,
      mode: channel.mode || null,
      purpose: channel.purpose || null,
      updatedAt: channel.updatedAt
    })),
    operation: {
      activeMeeting,
      currentRace,
      nextRace: upcomingRace,
      meetings: meetings.slice(0, 10),
      raceCount: races.length
    },
    documents: {
      states: documentStates,
      recent: documents.map((document: any) => ({
        id: document.id,
        filename: document.filename,
        classification: document.classification,
        confidence: document.confidence,
        authority: document.authority,
        status: document.status,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt
      }))
    },
    providers: providerStatus,
    agent,
    queue: {
      states: queue,
      pending: queuePending,
      failed: queueFailed
    },
    conflicts: {
      ...conflictRows,
      total: conflicts
    },
    alerts
  };
}
