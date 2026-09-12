import { createBlankWorkspace } from './seed.js';
import { loadLocalWorkspace } from './store.js';
import { normalizeWorkspaceShape } from './workspace.js';

const ENDPOINT = '/api/hipico/command-center';
let remoteState = { status: 'idle', data: null, error: '', updatedAt: null };
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
    disabled: 'Deshabilitado', unknown: 'No verificado', not_exposed: 'No expuesto', offline: 'Sin conexión'
  };
  return labels[state] || state.replaceAll('_', ' ');
}

function stateTone(value) {
  const state = String(value || '').toLowerCase();
  if (['ready', 'known'].includes(state)) return 'success';
  if (['degraded', 'not_ready', 'offline', 'not_exposed'].includes(state)) return 'warning';
  if (['unavailable'].includes(state)) return 'danger';
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
  const localState = local || { group: null, meeting: null, currentRace: null, nextRace: null, localQueue: 0, localConflicts: 0 };
  const remoteKnown = Boolean(remote && typeof remote === 'object');
  const fallbackState = online ? 'unknown' : 'offline';
  const system = remoteKnown ? remote.system : { state: fallbackState };
  const bridge = remoteKnown ? remote.bridge : { state: fallbackState };
  const channel = remoteKnown ? remote.channel : { state: fallbackState };
  const database = remoteKnown ? remote.database : { state: fallbackState };
  const providers = remoteKnown ? remote.providers : { state: fallbackState, provider: 'unknown' };
  const agent = remoteKnown ? remote.agent : { state: fallbackState, mode: 'unknown' };
  const documents = remoteKnown ? remote.documents : { state: fallbackState };
  const remoteQueue = remoteKnown && remote.queue?.available ? Number(remote.queue.total || 0) : null;
  const queueTotal = Number(localState.localQueue || 0) + (remoteQueue ?? 0);
  const reconciliation = remoteKnown ? Number(remote.conflicts?.reconciliationRequired || 0) : 0;
  const conflicts = Number(localState.localConflicts || 0) + reconciliation;
  const alerts = remoteKnown && Array.isArray(remote.alerts) ? remote.alerts : (error ? ['REMOTE_STATUS_UNAVAILABLE'] : []);
  const sampled = remote?.sampledAt ? new Date(remote.sampledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'sin muestra remota';

  return `<section class="card section-gap" data-command-center aria-labelledby="command-center-title">
    <div class="card__head"><div><h3 id="command-center-title">Centro de operaciones</h3><small>Estados reales del dispositivo y del backend · ${escapeHtml(sampled)}</small></div><span class="badge badge--${online ? 'success' : 'warning'}">${online ? 'EN LÍNEA' : 'SIN CONEXIÓN'}</span></div>
    <div class="card__body">
      <div class="grid grid--kpi">
        ${statusTile('Sistema', system.state, system.backendReachable === true ? 'Backend alcanzable' : online ? 'Backend sin confirmar' : 'Red no disponible')}
        ${statusTile('Bridge', bridge.state, bridge.ready === true ? 'SOURCE/LAB verificados' : 'Requiere verificación')}
        ${statusTile('Canal', channel.state, channel.qaMode || channel.groupAutomation || 'Sin estado remoto')}
        ${statusTile('Base de datos', database.state, database.ready === true ? 'PostgreSQL listo' : 'Persistencia no confirmada')}
        ${statusTile('Proveedor', providers.state, providers.provider || 'Sin proveedor')}
        ${statusTile('Agente', agent.state, agent.mode || 'Sin modo')}
        ${statusTile('Documentos', documents.state, documents.reason || 'Capacidad no informada')}
        ${statusTile('Cola', queueTotal > 0 ? 'degraded' : 'ready', `${queueTotal} pendiente(s) visibles`)}
        ${statusTile('Conflictos', conflicts > 0 ? 'degraded' : 'ready', `${conflicts} conflicto(s) / conciliación`)}
        ${statusTile('Alertas', alerts.length > 0 ? 'degraded' : remoteKnown ? 'ready' : fallbackState, alerts.length ? `${alerts.length}: ${alerts.join(', ')}` : 'Sin alertas reportadas')}
      </div>
      <div class="responsive-records section-gap-small" aria-label="Contexto operativo activo">
        <article><strong>Grupo activo</strong><span>${escapeHtml(localState.group?.name || 'Sin grupo')}</span><small>${escapeHtml(localState.group?.companyName || 'Contexto local')}</small></article>
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

async function readRemoteState() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    remoteState = { status: 'offline', data: null, error: 'offline', updatedAt: new Date().toISOString() };
    return remoteState;
  }
  try {
    const response = await fetch(ENDPOINT, { cache: 'no-store', headers: { accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok || payload?.ok !== true || !payload?.data) throw new Error(String(payload?.error || `HTTP_${response.status}`));
    remoteState = { status: 'ready', data: payload.data, error: '', updatedAt: new Date().toISOString() };
  } catch {
    remoteState = { status: 'error', data: null, error: 'remote_status_unavailable', updatedAt: new Date().toISOString() };
  }
  return remoteState;
}

async function hydrate() {
  const hero = document.querySelector('.content > .group-hero');
  if (!hero || document.querySelector('[data-command-center]')) return;
  const local = await readLocalContext();
  if (!remoteState.updatedAt || Date.now() - Date.parse(remoteState.updatedAt) > 15_000) await readRemoteState();
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
