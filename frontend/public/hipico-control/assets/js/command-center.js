import { createBlankWorkspace } from './seed.js';
import { loadLocalWorkspace } from './store.js';
import { normalizeWorkspaceShape } from './workspace.js';

const ENDPOINT = '/api/hipico/command-center';
let remoteState = { status: 'idle', data: null, error: '', updatedAt: null, groupKey: '' };
let refreshPromise = null;
let mountScheduled = false;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function groupRows(workspace, groupId, key) {
  return (Array.isArray(workspace?.[key]) ? workspace[key] : []).filter((row) => String(row?.groupId || '') === String(groupId || ''));
}

function raceOrder(left, right) {
  const numberDelta = Number(left?.number || 0) - Number(right?.number || 0);
  if (numberDelta) return numberDelta;
  return String(left?.id || '').localeCompare(String(right?.id || ''));
}

export function operationalWorkspaceContext(source) {
  const workspace = source && typeof source === 'object' ? source : {};
  const groups = workspace?.config?.groups || workspace?.config?.whatsappGroups || [];
  const groupId = String(workspace?.config?.activeGroupId || workspace?.config?.activeWhatsappGroupId || groups[0]?.id || '');
  const group = groups.find((item) => String(item?.id || '') === groupId) || groups[0] || null;
  const groupKey = String(group?.channelKey || group?.groupKey || group?.key || group?.id || groupId || '').trim();
  const days = groupRows(workspace, groupId, 'days').sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || '')));
  const meeting = [...days].reverse().find((day) => String(day?.status || '').toLowerCase() === 'open') || days.at(-1) || null;
  const races = groupRows(workspace, groupId, 'races')
    .filter((race) => !meeting?.id || String(race?.dayId || '') === String(meeting.id))
    .sort(raceOrder);
  const configuredRaceId = String(workspace?.config?.activeRaceByGroup?.[groupId] || workspace?.activeRaceId || '');
  const currentRace = races.find((race) => String(race?.id || '') === configuredRaceId)
    || races.find((race) => ['open', 'active'].includes(String(race?.status || '').toLowerCase()))
    || null;
  const currentIndex = currentRace ? races.findIndex((race) => race === currentRace) : -1;
  const nextRace = currentIndex >= 0
    ? races.slice(currentIndex + 1).find((race) => !['closed', 'settled', 'cancelled'].includes(String(race?.status || '').toLowerCase())) || null
    : races.find((race) => !['closed', 'settled', 'cancelled'].includes(String(race?.status || '').toLowerCase())) || null;
  return {
    group,
    groupKey,
    meeting,
    currentRace,
    nextRace,
    localQueue: Array.isArray(workspace?.syncQueue) ? workspace.syncQueue.length : 0,
    localConflicts: Math.max(0, Number(workspace?.syncMeta?.conflictSnapshots || 0))
  };
}

function humanState(value) {
  const state = String(value || 'unknown').toLowerCase();
  const labels = {
    ready: 'Operativo', known: 'Disponible', degraded: 'Degradado', unavailable: 'No disponible', not_ready: 'No listo',
    disabled: 'Deshabilitado', unknown: 'No verificado', not_exposed: 'No expuesto', offline: 'Sin conexión',
    not_configured: 'No configurado', active: 'Activo', inactive: 'Inactivo', blocked: 'Bloqueado'
  };
  return labels[state] || state.replaceAll('_', ' ');
}

function humanAlert(value) {
  const code = String(value || '').toUpperCase();
  const labels = {
    BACKEND_NOT_READY: 'Backend no listo', DATABASE_NOT_READY: 'Base de datos no lista', BRIDGE_NOT_READY: 'Bridge no listo',
    CHANNEL_READ_UNAVAILABLE: 'Lectura del canal no disponible', CHANNEL_NOT_REGISTERED: 'Canal no registrado',
    OUTBOX_READ_UNAVAILABLE: 'Lectura de cola no disponible', OUTBOX_FAILED: 'Hay envíos fallidos', OUTBOX_PENDING: 'Hay envíos pendientes',
    SHADOW_READ_UNAVAILABLE: 'Lectura del agente no disponible', DOCUMENT_READ_UNAVAILABLE: 'Lectura de documentos no disponible',
    DOCUMENT_REVIEW_PENDING: 'Hay documentos por revisar', DOCUMENT_FAILED: 'Hay documentos fallidos',
    RECONCILIATION_READ_UNAVAILABLE: 'Lectura de conciliación no disponible', RECONCILIATION_REQUIRED: 'Conciliación requerida',
    RACE_READ_UNAVAILABLE: 'Lectura de carreras no disponible', RACE_CONTEXT_REQUIRES_REVIEW: 'Contexto de carreras requiere revisión',
    REMOTE_STATUS_UNAVAILABLE: 'Estado remoto no disponible'
  };
  return labels[code] || String(value || 'Alerta operativa');
}

function stateTone(value) {
  const state = String(value || '').toLowerCase();
  if (['ready', 'known', 'active'].includes(state)) return 'success';
  if (['degraded', 'not_ready', 'offline', 'not_exposed', 'not_configured', 'inactive'].includes(state)) return 'warning';
  if (['unavailable', 'blocked'].includes(state)) return 'danger';
  return 'info';
}

function statusTile(label, state, detail) {
  const tone = stateTone(state);
  return `<article class="card kpi" data-command-state="${escapeHtml(state || 'unknown')}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(humanState(state))}</strong><span class="badge badge--${tone}">${escapeHtml(detail || 'Sin detalle adicional')}</span></article>`;
}

function raceLabel(race) {
  if (!race) return 'Sin carrera';
  const track = String(race.racetrack || race.track || 'Hipódromo sin identificar');
  const number = race.number == null ? '' : ` · ${race.number}ª`;
  return `${track}${number}`;
}

export function renderCommandCenterModel({ local, remote, online = true, error = '' } = {}) {
  const localState = local || { group: null, groupKey: '', meeting: null, currentRace: null, nextRace: null, localQueue: 0, localConflicts: 0 };
  const remoteKnown = Boolean(remote && typeof remote === 'object');
  const fallbackState = online ? 'unknown' : 'offline';
  const system = remoteKnown ? remote.system : { state: fallbackState };
  const bridge = remoteKnown ? remote.bridge : { state: fallbackState };
  const channel = remoteKnown ? remote.channel : { state: fallbackState };
  const database = remoteKnown ? remote.database : { state: fallbackState };
  const providers = remoteKnown ? remote.providers : { state: fallbackState, provider: 'unknown' };
  const agent = remoteKnown ? remote.agent : { state: fallbackState, mode: 'unknown' };
  const documents = remoteKnown ? remote.documents : { state: fallbackState, available: false };
  const queueAvailable = Boolean(remoteKnown && remote.queue?.available === true);
  const conflictAvailable = Boolean(remoteKnown && remote.conflicts?.available === true);
  const raceReadAvailable = Boolean(remoteKnown && remote.races?.available === true);
  const remoteQueue = queueAvailable && Number.isFinite(Number(remote.queue?.total)) ? Number(remote.queue.total) : null;
  const queueTotal = Number(localState.localQueue || 0) + (remoteQueue ?? 0);
  const reconciliation = conflictAvailable && Number.isFinite(Number(remote.conflicts?.reconciliationRequired))
    ? Number(remote.conflicts.reconciliationRequired)
    : null;
  const conflicts = Number(localState.localConflicts || 0) + (reconciliation ?? 0);
  const queueState = remoteKnown ? (queueAvailable ? (queueTotal > 0 ? 'degraded' : 'ready') : 'unavailable') : fallbackState;
  const conflictState = remoteKnown ? (conflictAvailable ? (conflicts > 0 ? 'degraded' : 'ready') : 'unavailable') : fallbackState;
  const raceReadState = remoteKnown ? (raceReadAvailable ? String(remote.races?.state || 'ready') : 'unavailable') : fallbackState;
  const alerts = remoteKnown && Array.isArray(remote.alerts) ? remote.alerts : (error ? ['REMOTE_STATUS_UNAVAILABLE'] : []);
  const sampled = remote?.sampledAt ? new Date(remote.sampledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'sin muestra remota';
  const documentDetail = remoteKnown && documents.available === false
    ? 'Lectura remota no disponible'
    : remoteKnown && Number.isFinite(Number(documents.total))
      ? `${Number(documents.total)} documento(s) visibles`
      : documents.reason || 'Capacidad no informada';
  const queueDetail = remoteKnown && !queueAvailable
    ? `Lectura remota no disponible · ${Number(localState.localQueue || 0)} local(es)`
    : `${queueTotal} pendiente(s) visibles`;
  const conflictDetail = remoteKnown && !conflictAvailable
    ? `Lectura remota no disponible · ${Number(localState.localConflicts || 0)} local(es)`
    : `${conflicts} conflicto(s) / conciliación`;
  const raceReadDetail = remoteKnown && !raceReadAvailable
    ? 'Lectura remota no disponible'
    : `${Number(remote?.races?.total || 0)} carrera(s) persistida(s)`;
  const alertDetail = alerts.length ? `${alerts.length}: ${alerts.map(humanAlert).join(' · ')}` : 'Sin alertas reportadas';

  return `<section class="card section-gap" data-command-center aria-labelledby="command-center-title">
    <div class="card__head"><div><h3 id="command-center-title">Centro de operaciones</h3><small>Estados reales del dispositivo y del backend · ${escapeHtml(sampled)}</small></div><span class="badge badge--${online ? 'success' : 'warning'}">${online ? 'EN LÍNEA' : 'SIN CONEXIÓN'}</span></div>
    <div class="card__body">
      <div class="grid grid--kpi">
        ${statusTile('Sistema', system.state, system.backendReachable === true ? 'Backend alcanzable' : online ? 'Backend sin confirmar' : 'Red no disponible')}
        ${statusTile('Bridge', bridge.state, bridge.ready === true ? 'SOURCE/LAB verificados' : 'Requiere verificación')}
        ${statusTile('Canal', channel.state, channel.available === false ? 'Lectura remota no disponible' : channel.qaMode || channel.groupAutomation || 'Sin estado remoto')}
        ${statusTile('Base de datos', database.state, database.ready === true ? 'PostgreSQL listo' : 'Persistencia no confirmada')}
        ${statusTile('Proveedor', providers.state, providers.provider || 'Sin proveedor')}
        ${statusTile('Agente', agent.state, agent.mode || 'Sin modo')}
        ${statusTile('Documentos', documents.state, documentDetail)}
        ${statusTile('Cola', queueState, queueDetail)}
        ${statusTile('Conflictos', conflictState, conflictDetail)}
        ${statusTile('Carreras backend', raceReadState, raceReadDetail)}
        ${statusTile('Alertas', alerts.length > 0 ? 'degraded' : remoteKnown ? 'ready' : fallbackState, alertDetail)}
      </div>
      <div class="responsive-records section-gap-small" aria-label="Contexto operativo activo">
        <article><strong>Grupo activo</strong><span>${escapeHtml(localState.group?.name || 'Sin grupo')}</span><small>${escapeHtml(localState.group?.companyName || localState.groupKey || 'Contexto local')}</small></article>
        <article><strong>Jornada / meeting</strong><span>${escapeHtml(localState.meeting?.date || 'Sin jornada')}</span><small>${escapeHtml(localState.meeting?.status || 'No disponible')}</small></article>
        <article><strong>Carrera actual</strong><span>${escapeHtml(raceLabel(localState.currentRace))}</span><small>${escapeHtml(localState.currentRace?.status || 'No seleccionada')}</small></article>
        <article><strong>Próxima carrera</strong><span>${escapeHtml(raceLabel(localState.nextRace))}</span><small>${escapeHtml(localState.nextRace?.status || 'No identificada')}</small></article>
      </div>
    </div>
  </section>`;
}

async function readLocalContext() {
  try {
    const raw = await loadLocalWorkspace(createBlankWorkspace);
    return operationalWorkspaceContext(normalizeWorkspaceShape(raw));
  } catch {
    return operationalWorkspaceContext(null);
  }
}

async function readRemoteState(groupKey) {
  const normalizedGroupKey = String(groupKey || '').trim();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    remoteState = { status: 'offline', data: null, error: 'offline', updatedAt: new Date().toISOString(), groupKey: normalizedGroupKey };
    return remoteState;
  }
  if (!normalizedGroupKey) {
    remoteState = { status: 'error', data: null, error: 'group_scope_unavailable', updatedAt: new Date().toISOString(), groupKey: '' };
    return remoteState;
  }
  try {
    const response = await fetch(`${ENDPOINT}?groupKey=${encodeURIComponent(normalizedGroupKey)}`, { cache: 'no-store', headers: { accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok || payload?.ok !== true || !payload?.data) throw new Error(String(payload?.error || `HTTP_${response.status}`));
    remoteState = { status: 'ready', data: payload.data, error: '', updatedAt: new Date().toISOString(), groupKey: normalizedGroupKey };
  } catch {
    remoteState = { status: 'error', data: null, error: 'remote_status_unavailable', updatedAt: new Date().toISOString(), groupKey: normalizedGroupKey };
  }
  return remoteState;
}

async function hydrate() {
  const hero = document.querySelector('.content > .group-hero');
  if (!hero || document.querySelector('[data-command-center]')) return;
  const local = await readLocalContext();
  const stale = !remoteState.updatedAt || Date.now() - Date.parse(remoteState.updatedAt) > 15_000;
  const scopeChanged = remoteState.groupKey !== local.groupKey;
  if (stale || scopeChanged) await readRemoteState(local.groupKey);
  if (!hero.isConnected || document.querySelector('[data-command-center]')) return;
  hero.insertAdjacentHTML('afterend', renderCommandCenterModel({ local, remote: remoteState.data, online: navigator.onLine !== false, error: remoteState.error }));
}

function scheduleHydrate() {
  if (mountScheduled || typeof document === 'undefined') return;
  mountScheduled = true;
  queueMicrotask(() => {
    mountScheduled = false;
    if (!refreshPromise) {
      refreshPromise = hydrate().finally(() => { refreshPromise = null; });
    }
  });
}

if (typeof document !== 'undefined') {
  scheduleHydrate();
  if (typeof MutationObserver === 'function') new MutationObserver(scheduleHydrate).observe(document.documentElement, { childList: true, subtree: true });
  globalThis.addEventListener?.('online', () => { remoteState.updatedAt = null; document.querySelector('[data-command-center]')?.remove(); scheduleHydrate(); });
  globalThis.addEventListener?.('offline', () => { remoteState.updatedAt = null; document.querySelector('[data-command-center]')?.remove(); scheduleHydrate(); });
}
