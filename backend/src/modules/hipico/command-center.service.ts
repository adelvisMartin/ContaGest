import { prisma } from '../../database/prisma.js';
import { buildHipicoSystemStatus } from './hipico-system.service.js';
import { createDefaultRacingProviderRegistry } from './provider-registry.js';
import { PostgresDocumentStore } from './document.store.js';
import { RaceLifecycleStore } from './race.store.js';
import { AutomationStore } from './automation.store.js';

export type CommandCenterScope = {
  ownerId: string;
  groupKey: string;
};

type AgentScope = CommandCenterScope & { groupId: string };
type CountRow = { count: bigint | number };
type StateCountRow = { state: string; count: bigint | number };
type ReadState = 'ready' | 'unavailable';
type Alert = { severity: 'info' | 'warning' | 'critical'; code: string; message: string };

type CommandCenterDependencies = {
  now: () => Date;
  systemStatus: () => Promise<any>;
  meetings: (scope: CommandCenterScope) => Promise<any[]>;
  races: (scope: CommandCenterScope) => Promise<any[]>;
  documents: (scope: CommandCenterScope) => Promise<any[]>;
  providers: () => Promise<any[]>;
  channels: (scope: CommandCenterScope) => Promise<any[]>;
  queueStates: (scope: CommandCenterScope) => Promise<StateCountRow[]>;
  documentStates: (scope: CommandCenterScope) => Promise<StateCountRow[]>;
  agentGroupIds: (scope: CommandCenterScope) => Promise<string[]>;
  conflicts: (scope: CommandCenterScope, groupId: string | null) => Promise<{ reconciliations: number; rejectedTransitions: number; agentConflicts: number }>;
  lastBridgeEvent: (scope: CommandCenterScope) => Promise<Date | string | null>;
  agentState: (scope: AgentScope) => Promise<{ mode: string; metrics: any }>;
};

const raceStore = new RaceLifecycleStore();
const documentStore = new PostgresDocumentStore();
const automationStore = new AutomationStore();
const providerRegistry = createDefaultRacingProviderRegistry();

function asCount(value: bigint | number | null | undefined) {
  return Number(value || 0);
}

function stateMap(rows: StateCountRow[]) {
  return Object.fromEntries(rows.map((row) => [String(row.state), asCount(row.count)]));
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

async function read<T>(fn: () => Promise<T>, fallback: T): Promise<{ state: ReadState; data: T; reason: string | null }> {
  try {
    return { state: 'ready', data: await fn(), reason: null };
  } catch {
    return { state: 'unavailable', data: fallback, reason: 'READ_FAILED' };
  }
}

const defaultDependencies: CommandCenterDependencies = {
  now: () => new Date(),
  systemStatus: () => buildHipicoSystemStatus(),
  meetings: (scope) => raceStore.listMeetings(scope.ownerId, scope.groupKey, 30),
  races: (scope) => raceStore.listRaces(scope.ownerId, scope.groupKey, null, 200),
  documents: (scope) => documentStore.list(scope.ownerId, scope.groupKey, 20),
  providers: () => providerRegistry.status(),
  channels: (scope) => prisma.$queryRaw<any[]>`
    SELECT group_key AS "groupKey", label, channel_type AS "channelType", status,
      config->>'mode' AS mode, config->>'purpose' AS purpose, updated_at AS "updatedAt"
    FROM public.hipico_bot_channels
    WHERE owner_id = ${scope.ownerId}::uuid AND group_key = ${scope.groupKey}
    ORDER BY updated_at DESC
    LIMIT 50`,
  queueStates: (scope) => prisma.$queryRaw<StateCountRow[]>`
    SELECT status AS state, COUNT(*)::bigint AS count
    FROM public.hipico_outbox
    WHERE owner_id = ${scope.ownerId}::uuid AND group_key = ${scope.groupKey}
    GROUP BY status`,
  documentStates: (scope) => prisma.$queryRaw<StateCountRow[]>`
    SELECT status AS state, COUNT(*)::bigint AS count
    FROM public.hipico_documents
    WHERE owner_id = ${scope.ownerId}::uuid AND group_key = ${scope.groupKey}
    GROUP BY status`,
  agentGroupIds: async (scope) => {
    const rows = await prisma.$queryRaw<Array<{ groupId: string }>>`
      SELECT group_id AS "groupId"
      FROM public.hipico_group_automation
      WHERE owner_id = ${scope.ownerId}::uuid AND group_key = ${scope.groupKey}
      ORDER BY updated_at DESC, group_id ASC
      LIMIT 2`;
    return rows.map((row) => String(row.groupId || '').trim()).filter(Boolean);
  },
  conflicts: async (scope, groupId) => {
    const [reconciliations, rejectedTransitions, agentConflicts] = await Promise.all([
      prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::bigint AS count
        FROM public.hipico_reconciliations
        WHERE owner_id = ${scope.ownerId}::uuid AND group_key = ${scope.groupKey}
          AND status IN ('difference','pending')`,
      prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::bigint AS count
        FROM public.hipico_race_events
        WHERE owner_id = ${scope.ownerId}::uuid AND group_key = ${scope.groupKey}
          AND disposition = 'rejected'`,
      groupId
        ? prisma.$queryRaw<CountRow[]>`
            SELECT COUNT(*)::bigint AS count
            FROM public.hipico_agent_evaluations
            WHERE owner_id = ${scope.ownerId}::uuid AND group_key = ${scope.groupKey}
              AND group_id = ${groupId} AND actual_intent IS NOT NULL AND conflict = true`
        : Promise.resolve([{ count: 0 }])
    ]);
    return {
      reconciliations: asCount(reconciliations[0]?.count),
      rejectedTransitions: asCount(rejectedTransitions[0]?.count),
      agentConflicts: asCount(agentConflicts[0]?.count)
    };
  },
  lastBridgeEvent: async (scope) => {
    const rows = await prisma.$queryRaw<Array<{ createdAt: Date | string }>>`
      SELECT created_at AS "createdAt"
      FROM public.hipico_messages
      WHERE owner_id = ${scope.ownerId}::uuid AND group_key = ${scope.groupKey}
        AND metadata->>'source' IN ('official_web_playwright','whatsapp-web-bridge')
      ORDER BY created_at DESC
      LIMIT 1`;
    return rows[0]?.createdAt || null;
  },
  agentState: async (scope) => {
    const [config, metrics] = await Promise.all([
      automationStore.get(scope.ownerId, scope.groupKey, scope.groupId),
      automationStore.metrics(scope.ownerId, scope.groupKey, scope.groupId)
    ]);
    return { mode: config?.mode || 'DISABLED', metrics };
  }
};

export async function buildHipicoCommandCenter(
  scope: CommandCenterScope,
  overrides: Partial<CommandCenterDependencies> = {}
) {
  const deps = { ...defaultDependencies, ...overrides };
  const now = deps.now();
  const system = await deps.systemStatus();
  const agentIdentityRead = await read(() => deps.agentGroupIds(scope), [] as string[]);
  const resolvedAgentGroupId = agentIdentityRead.state === 'ready' && agentIdentityRead.data.length === 1
    ? agentIdentityRead.data[0]
    : null;

  const [meetingsRead, racesRead, documentsRead, providersRead, channelsRead, queueRead, documentStatesRead, conflictsRead, bridgeRead] = await Promise.all([
    read(() => deps.meetings(scope), [] as any[]),
    read(() => deps.races(scope), [] as any[]),
    read(() => deps.documents(scope), [] as any[]),
    read(() => deps.providers(), [] as any[]),
    read(() => deps.channels(scope), [] as any[]),
    read(() => deps.queueStates(scope), [] as StateCountRow[]),
    read(() => deps.documentStates(scope), [] as StateCountRow[]),
    read(() => deps.conflicts(scope, resolvedAgentGroupId), { reconciliations: 0, rejectedTransitions: 0, agentConflicts: 0 }),
    read(() => deps.lastBridgeEvent(scope), null as Date | string | null)
  ]);

  const races = racesRead.data;
  const meetings = meetingsRead.data;
  const currentRace = racesRead.state === 'ready' ? firstCurrentRace(races) : null;
  const upcomingRace = racesRead.state === 'ready' ? nextRace(races) : null;
  const activeMeeting = meetingsRead.state === 'ready'
    ? currentRace
      ? meetings.find((meeting: any) => meeting.id === currentRace.meetingId) || null
      : meetings[0] || null
    : null;

  const queueStates = queueRead.state === 'ready' ? stateMap(queueRead.data) : {};
  const documentStates = documentStatesRead.state === 'ready' ? stateMap(documentStatesRead.data) : {};
  const queuePending = queueRead.state === 'ready'
    ? (queueStates.queued || 0) + (queueStates.sending || 0) + (queueStates.retry || 0)
    : null;
  const queueFailed = queueRead.state === 'ready' ? (queueStates.failed || 0) : null;
  const conflictsTotal = conflictsRead.state === 'ready'
    ? conflictsRead.data.reconciliations + conflictsRead.data.rejectedTransitions + conflictsRead.data.agentConflicts
    : null;

  let agent: any;
  if (agentIdentityRead.state === 'unavailable') {
    agent = { state: 'unavailable', reason: 'AGENT_IDENTITY_READ_FAILED', mode: null, metrics: null };
  } else if (agentIdentityRead.data.length === 0) {
    agent = { state: 'not_configured', reason: 'GROUP_ID_NOT_CONFIGURED', mode: null, metrics: null };
  } else if (agentIdentityRead.data.length > 1) {
    agent = { state: 'unavailable', reason: 'GROUP_ID_AMBIGUOUS', mode: null, metrics: null };
  } else {
    const agentRead = await read(() => deps.agentState({ ...scope, groupId: resolvedAgentGroupId! }), null as any);
    agent = agentRead.state === 'ready'
      ? { state: 'ready', reason: null, mode: agentRead.data.mode, metrics: agentRead.data.metrics }
      : { state: 'unavailable', reason: 'AGENT_READ_FAILED', mode: null, metrics: null };
  }

  const lastBridgeAt = bridgeRead.state === 'ready' && bridgeRead.data ? new Date(bridgeRead.data) : null;
  const validBridgeDate = lastBridgeAt && Number.isFinite(lastBridgeAt.getTime()) ? lastBridgeAt : null;
  const bridgeAgeMs = validBridgeDate ? Math.max(0, now.getTime() - validBridgeDate.getTime()) : null;
  const bridgeConfigured = system.components.bridge.state !== 'not_configured';
  const bridgeRuntimeState = !bridgeConfigured
    ? 'not_configured'
    : bridgeRead.state === 'unavailable'
      ? 'unavailable'
      : bridgeAgeMs == null
        ? 'degraded'
        : bridgeAgeMs <= 2 * 60 * 1000
          ? 'ready'
          : 'degraded';

  const alerts: Alert[] = [];
  for (const [component, value] of Object.entries(system.components)) {
    const state = (value as any).state;
    if (state === 'unavailable') alerts.push({ severity: 'critical', code: `COMPONENT_${component.toUpperCase()}_UNAVAILABLE`, message: `${component} no está disponible.` });
    else if (state === 'degraded') alerts.push({ severity: 'warning', code: `COMPONENT_${component.toUpperCase()}_DEGRADED`, message: `${component} está degradado.` });
  }

  const failedReads: Array<[string, typeof providersRead, string]> = [
    ['MEETING', meetingsRead as any, 'Reuniones no disponibles.'],
    ['RACE', racesRead as any, 'Carreras no disponibles.'],
    ['DOCUMENT', documentsRead as any, 'Documentos no disponibles.'],
    ['PROVIDER', providersRead as any, 'Providers no disponibles.'],
    ['CHANNEL', channelsRead as any, 'Canales no disponibles.'],
    ['QUEUE', queueRead as any, 'Cola operativa no disponible.'],
    ['CONFLICT', conflictsRead as any, 'Conflictos no disponibles.']
  ];
  for (const [code, result, message] of failedReads) {
    if (result.state === 'unavailable') alerts.push({ severity: 'warning', code: `${code}_READ_UNAVAILABLE`, message });
  }

  if (agentIdentityRead.state === 'unavailable') {
    alerts.push({ severity: 'warning', code: 'AGENT_IDENTITY_READ_UNAVAILABLE', message: 'No se pudo resolver de forma segura la identidad del grupo para el agente.' });
  } else if (agentIdentityRead.data.length > 1) {
    alerts.push({ severity: 'warning', code: 'AGENT_GROUP_ID_AMBIGUOUS', message: 'El grupo tiene más de una identidad de automatización; se requiere revisión manual.' });
  }

  if (bridgeRead.state === 'unavailable') alerts.push({ severity: 'warning', code: 'BRIDGE_READ_UNAVAILABLE', message: 'No se pudo determinar la actividad reciente del Bridge.' });
  else if (bridgeConfigured && bridgeAgeMs == null) alerts.push({ severity: 'warning', code: 'BRIDGE_NO_EVENTS', message: 'Bridge configurado sin eventos persistidos todavía.' });
  else if (bridgeAgeMs != null && bridgeAgeMs > 2 * 60 * 1000) alerts.push({ severity: 'warning', code: 'BRIDGE_STALE', message: 'El último evento del Bridge supera dos minutos.' });

  if (queueFailed != null && queueFailed > 0) alerts.push({ severity: 'critical', code: 'OUTBOX_FAILED', message: `${queueFailed} elemento(s) de cola fallaron.` });
  if (queuePending != null && queuePending > 0) alerts.push({ severity: 'warning', code: 'OUTBOX_PENDING', message: `${queuePending} elemento(s) siguen pendientes o en reintento.` });
  if (conflictsTotal != null && conflictsTotal > 0) alerts.push({ severity: 'warning', code: 'OPERATION_CONFLICTS', message: `${conflictsTotal} conflicto(s) requieren revisión.` });
  if (documentStatesRead.state === 'ready' && (documentStates.review || 0) > 0) alerts.push({ severity: 'warning', code: 'DOCUMENT_REVIEW_PENDING', message: `${documentStates.review} documento(s) requieren revisión.` });
  if (documentStatesRead.state === 'ready' && (documentStates.failed || 0) > 0) alerts.push({ severity: 'critical', code: 'DOCUMENT_FAILED', message: `${documentStates.failed} documento(s) fallaron al procesarse.` });
  if (racesRead.state === 'ready' && !currentRace) alerts.push({ severity: 'info', code: 'NO_ACTIVE_RACE', message: 'No hay una carrera operativa activa en este grupo.' });

  return {
    generatedAt: now.toISOString(),
    scope: { groupKey: scope.groupKey },
    version: system.version,
    system: { ok: system.ok, components: system.components },
    bridge: {
      state: bridgeRuntimeState,
      configuredState: system.components.bridge.state,
      lastEventAt: validBridgeDate?.toISOString() || null,
      ageMs: bridgeAgeMs,
      sourceSendPossible: false
    },
    channels: {
      state: channelsRead.state,
      items: channelsRead.data.map((channel: any) => ({
        groupKey: channel.groupKey,
        label: channel.label,
        channelType: channel.channelType,
        status: channel.status,
        mode: channel.mode || null,
        purpose: channel.purpose || null,
        updatedAt: channel.updatedAt
      }))
    },
    operation: {
      state: meetingsRead.state === 'ready' && racesRead.state === 'ready' ? 'ready' : 'unavailable',
      activeMeeting,
      currentRace,
      nextRace: upcomingRace,
      meetings: meetingsRead.state === 'ready' ? meetings.slice(0, 10) : [],
      raceCount: racesRead.state === 'ready' ? races.length : null
    },
    documents: {
      state: documentsRead.state === 'ready' && documentStatesRead.state === 'ready' ? 'ready' : 'unavailable',
      states: documentStatesRead.state === 'ready' ? documentStates : null,
      recent: documentsRead.state === 'ready' ? documentsRead.data.map((document: any) => ({
        id: document.id,
        filename: document.filename,
        classification: document.classification,
        confidence: document.confidence,
        authority: document.authority,
        status: document.status,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt
      })) : []
    },
    providers: {
      state: providersRead.state,
      items: providersRead.data,
      financialAuthority: false
    },
    agent,
    queue: {
      state: queueRead.state,
      states: queueRead.state === 'ready' ? queueStates : null,
      pending: queuePending,
      failed: queueFailed
    },
    conflicts: {
      state: conflictsRead.state,
      ...(conflictsRead.state === 'ready' ? conflictsRead.data : { reconciliations: null, rejectedTransitions: null, agentConflicts: null }),
      total: conflictsTotal
    },
    alerts
  };
}