import { currentSession, refreshCloudSession } from './supabase.js';
import { escapeHtml } from './ui.js';

const ENDPOINT = '/api/hipico/command-center';
const REQUEST_TIMEOUT_MS = 12000;

export function initialCommandCenterState() {
  return { status: 'idle', data: null, error: '', updatedAt: null, stale: false };
}

function stateLabel(value) {
  const labels = {
    ready: 'Listo', degraded: 'Degradado', unavailable: 'No disponible', not_configured: 'Sin configurar',
    connected: 'Conectado', disconnected: 'Desconectado'
  };
  return labels[String(value || '')] || String(value || 'Desconocido');
}

function badgeClass(value) {
  if (value === 'ready' || value === 'connected') return 'badge--success';
  if (value === 'unavailable' || value === 'failed') return 'badge--danger';
  if (value === 'degraded' || value === 'not_configured' || value === 'disconnected') return 'badge--warning';
  return 'badge--info';
}

function formatDate(value) {
  if (!value) return 'Sin evidencia';
  try { return new Date(value).toLocaleString('es-VE'); }
  catch { return String(value); }
}

function query(groupKey, groupId) {
  const search = new URLSearchParams({ groupKey });
  if (groupId) search.set('groupId', groupId);
  return `${ENDPOINT}?${search.toString()}`;
}

async function authorizedFetch(url, retry = true) {
  const session = currentSession();
  if (!session?.access_token) throw Object.assign(new Error('Inicia sesión en nube para consultar el Command Center.'), { code: 'HIPICO_COMMAND_CENTER_SESSION_REQUIRED' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${session.access_token}`, Accept: 'application/json' }
    });
    if (response.status === 401 && retry && session.refresh_token) {
      const refreshed = await refreshCloudSession();
      if (refreshed?.access_token) return authorizedFetch(url, false);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      const error = new Error(body?.message || body?.code || `Command Center HTTP ${response.status}`);
      error.code = body?.code || 'HIPICO_COMMAND_CENTER_HTTP_ERROR';
      error.status = response.status;
      throw error;
    }
    return body.data;
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('El Command Center tardó demasiado en responder.'), { code: 'HIPICO_COMMAND_CENTER_TIMEOUT' });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshCommandCenter(previous, { groupKey, groupId = null } = {}) {
  const current = previous || initialCommandCenterState();
  if (!groupKey) return { ...current, status: 'error', error: 'El grupo activo no tiene una clave válida.', stale: Boolean(current.data) };
  if (globalThis.navigator?.onLine === false) {
    return { ...current, status: current.data ? 'success' : 'offline', error: current.data ? '' : 'Sin conexión y sin una lectura previa del Command Center.', stale: true };
  }
  try {
    const data = await authorizedFetch(query(groupKey, groupId));
    return { status: 'success', data, error: '', updatedAt: new Date().toISOString(), stale: false };
  } catch (error) {
    return {
      ...current,
      status: 'error',
      error: String(error?.message || 'No se pudo actualizar el Command Center.'),
      stale: Boolean(current.data)
    };
  }
}

function componentCard(label, component) {
  const state = component?.state || 'not_configured';
  const reason = component?.reason || '';
  return `<article class="card kpi"><small>${escapeHtml(label)}</small><strong>${escapeHtml(stateLabel(state))}</strong><span class="badge ${badgeClass(state)}">${escapeHtml(state)}</span>${reason ? `<span>${escapeHtml(reason)}</span>` : ''}</article>`;
}

function raceLine(label, race) {
  if (!race) return `<div><span>${escapeHtml(label)}</span><strong>Sin carrera</strong></div>`;
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(`${race.number}ª · ${race.name}`)}</strong><small>${escapeHtml(race.state)}${race.scheduledAt ? ` · ${escapeHtml(formatDate(race.scheduledAt))}` : ''}</small></div>`;
}

export function renderCommandCenter(state) {
  const value = state || initialCommandCenterState();
  if (value.status === 'idle' || value.status === 'loading') {
    return `<section class="card section-gap" data-command-center><div class="card__head"><div><h3>Command Center</h3><small>Consultando backend canónico, Bridge, PostgreSQL, providers y agente…</small></div><span class="badge badge--info">Cargando</span></div><div class="card__body"><p class="muted">La información operativa se está verificando sin usar caché.</p></div></section>`;
  }
  if (!value.data) {
    const offline = value.status === 'offline';
    return `<section class="card section-gap" data-command-center><div class="card__head"><div><h3>Command Center</h3><small>${offline ? 'No hay conexión para verificar el estado.' : 'No se pudo obtener estado operativo.'}</small></div><span class="badge ${offline ? 'badge--warning' : 'badge--danger'}">${offline ? 'Offline' : 'Error'}</span></div><div class="card__body"><p>${escapeHtml(value.error || 'Estado no disponible.')}</p><button class="button button--primary" data-action="refresh-command-center" ${offline ? 'disabled' : ''}>Reintentar</button></div></section>`;
  }

  const data = value.data;
  const components = data.system?.components || {};
  const providerReady = Array.isArray(data.providers) && data.providers.some((item) => item?.state === 'ready');
  const providerComponent = { state: providerReady ? 'ready' : components.providers?.state || 'not_configured', reason: components.providers?.reason || null };
  const bridge = { state: data.bridge?.state || components.bridge?.state || 'not_configured', reason: data.bridge?.lastEventAt ? `Último evento ${formatDate(data.bridge.lastEventAt)}` : 'Sin evento reciente' };
  const channelReady = Array.isArray(data.channels) && data.channels.some((item) => item.status === 'active');
  const channel = { state: channelReady ? 'ready' : components.channel?.state || 'not_configured', reason: channelReady ? `${data.channels.filter((item) => item.status === 'active').length} canal(es) activo(s)` : components.channel?.reason || null };
  const agent = { state: data.agent?.state || components.agent?.state || 'not_configured', reason: data.agent?.mode ? `Modo ${data.agent.mode}` : data.agent?.reason || null };
  const alerts = Array.isArray(data.alerts) ? data.alerts : [];
  const documents = data.documents?.recent || [];
  const meeting = data.operation?.activeMeeting || null;
  const staleNotice = value.stale ? `<div class="offline-banner">Datos del Command Center sin confirmar · última lectura ${escapeHtml(formatDate(value.updatedAt))}</div>` : '';

  return `${staleNotice}<section class="page-head section-gap" data-command-center><div><h2>Command Center</h2><p>Estado real del backend canónico para ${escapeHtml(data.scope?.groupKey || 'grupo activo')} · lectura no cacheada.</p></div><div class="page-actions"><span class="badge ${data.system?.ok ? 'badge--success' : 'badge--warning'}">${data.system?.ok ? 'OPERATIVO' : 'ATENCIÓN'}</span><button class="button" data-action="refresh-command-center">Actualizar</button></div></section><div class="grid grid--kpi metrics-grid">${componentCard('Backend', components.backend)}${componentCard('PostgreSQL', components.database)}${componentCard('Bridge', bridge)}${componentCard('Canal', channel)}${componentCard('Providers', providerComponent)}${componentCard('Agente', agent)}</div><div class="grid grid--two section-gap"><section class="card"><div class="card__head"><div><h3>Operación canónica</h3><small>${meeting ? escapeHtml(meeting.name) : 'Sin meeting activo'}</small></div><span class="badge">${Number(data.operation?.raceCount || 0)} carreras</span></div><div class="card__body"><div class="control-stack">${raceLine('Carrera actual', data.operation?.currentRace)}${raceLine('Próxima carrera', data.operation?.nextRace)}<div><span>Cola pendiente</span><strong>${Number(data.queue?.pending || 0)}</strong><small>${Number(data.queue?.failed || 0)} fallidas</small></div><div><span>Conflictos</span><strong>${Number(data.conflicts?.total || 0)}</strong><small>reconciliación + transiciones + agente</small></div></div></div></section><section class="card"><div class="card__head"><div><h3>Alertas operativas</h3><small>Solo evidencia observable; no modifica jugadas ni saldos.</small></div><span class="badge ${alerts.some((item) => item.severity === 'critical') ? 'badge--danger' : alerts.length ? 'badge--warning' : 'badge--success'}">${alerts.length}</span></div><div class="card__body"><div class="list">${alerts.length ? alerts.map((item) => `<div class="audit-row"><strong>${escapeHtml(item.message)}</strong><span>${escapeHtml(item.code)}</span><small>${escapeHtml(item.severity.toUpperCase())}</small></div>`).join('') : '<div class="check-list"><div class="is-good">✓ Sin alertas observables en esta lectura.</div></div>'}</div></div></section></div><section class="card section-gap"><div class="card__head"><div><h3>Documentos recientes</h3><small>Clasificación, autoridad y estado del motor PDF.</small></div><span class="badge">${documents.length}</span></div><div class="card__body"><div class="responsive-records">${documents.length ? documents.slice(0, 8).map((document) => `<article><strong>${escapeHtml(document.filename || 'Documento')}</strong><span>${escapeHtml(document.classification || 'UNKNOWN')} · ${escapeHtml(document.status || 'unknown')}</span><small>${escapeHtml(document.authority || 'unknown')} · ${escapeHtml(formatDate(document.updatedAt || document.createdAt))}</small></article>`).join('') : '<div class="empty"><strong>Sin documentos</strong><span>No hay evidencia documental persistida para este grupo.</span></div>'}</div></div></section>`;
}
