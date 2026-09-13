import { currentSession, refreshCloudSession } from './supabase.js';
import { escapeHtml } from './ui.js';

const ENDPOINT = '/api/hipico/command-center';
const REQUEST_TIMEOUT_MS = 12000;

export function initialCommandCenterState() {
  return { status: 'idle', data: null, error: '', updatedAt: null, stale: false };
}

function stateLabel(value) {
  const labels = {
    ready: 'Listo',
    degraded: 'Degradado',
    unavailable: 'No disponible',
    not_configured: 'Sin configurar',
    connected: 'Conectado',
    disconnected: 'Desconectado',
    disabled: 'Deshabilitado'
  };
  return labels[String(value || '')] || String(value || 'Desconocido');
}

function badgeClass(value) {
  if (value === 'ready' || value === 'connected') return 'badge--success';
  if (value === 'unavailable' || value === 'failed') return 'badge--danger';
  if (value === 'degraded' || value === 'not_configured' || value === 'disconnected' || value === 'disabled') return 'badge--warning';
  return 'badge--info';
}

function formatDate(value) {
  if (!value) return 'Sin evidencia';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Fecha no válida';
  return date.toLocaleString('es-VE');
}

function query(groupKey) {
  return `${ENDPOINT}?${new URLSearchParams({ groupKey }).toString()}`;
}

function isOperationallyEmpty(data) {
  if (!data || typeof data !== 'object') return true;
  const races = Number(data.operation?.raceCount || 0);
  const meetings = Array.isArray(data.operation?.meetings) ? data.operation.meetings.length : 0;
  const documents = Array.isArray(data.documents?.recent) ? data.documents.recent.length : 0;
  const channels = Array.isArray(data.channels?.items) ? data.channels.items.length : 0;
  const alerts = Array.isArray(data.alerts) ? data.alerts.filter((item) => item?.severity !== 'info').length : 0;
  return races === 0 && meetings === 0 && documents === 0 && channels === 0 && alerts === 0;
}

async function authorizedFetch(url, retry = true) {
  const session = currentSession();
  if (!session?.access_token) {
    throw Object.assign(new Error('Inicia sesión en nube para consultar el Command Center.'), {
      code: 'HIPICO_COMMAND_CENTER_SESSION_REQUIRED'
    });
  }
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
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('El Command Center tardó demasiado en responder.'), {
        code: 'HIPICO_COMMAND_CENTER_TIMEOUT'
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshCommandCenter(previous, { groupKey } = {}) {
  const current = previous || initialCommandCenterState();
  if (!groupKey) {
    return {
      ...current,
      status: 'disabled',
      error: 'Selecciona un grupo válido para consultar el estado operativo.',
      stale: Boolean(current.data)
    };
  }
  if (globalThis.navigator?.onLine === false) {
    return {
      ...current,
      status: current.data ? 'stale' : 'offline',
      error: current.data ? '' : 'Sin conexión y sin una lectura previa del Command Center.',
      stale: true
    };
  }
  try {
    const data = await authorizedFetch(query(groupKey));
    return {
      status: isOperationallyEmpty(data) ? 'empty' : 'success',
      data,
      error: '',
      updatedAt: new Date().toISOString(),
      stale: false
    };
  } catch (error) {
    return {
      ...current,
      status: current.data ? 'stale' : 'error',
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

function countValue(value) {
  return Number.isFinite(Number(value)) && value !== null ? String(Number(value)) : 'No disponible';
}

function raceLine(label, race, operationState) {
  if (operationState === 'unavailable') {
    return `<div><span>${escapeHtml(label)}</span><strong>No disponible</strong><small>No se pudo leer el estado de carreras.</small></div>`;
  }
  if (!race) return `<div><span>${escapeHtml(label)}</span><strong>Sin carrera</strong></div>`;
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(`${race.number}ª · ${race.name}`)}</strong><small>${escapeHtml(race.state)}${race.scheduledAt ? ` · ${escapeHtml(formatDate(race.scheduledAt))}` : ''}</small></div>`;
}

function deriveChannel(data, components) {
  if (data.channels?.state === 'unavailable') return { state: 'unavailable', reason: 'CHANNEL_READ_UNAVAILABLE' };
  const items = Array.isArray(data.channels?.items) ? data.channels.items : [];
  const active = items.filter((item) => item.status === 'active').length;
  if (active) return { state: 'ready', reason: `${active} canal(es) activo(s)` };
  return components.channel || { state: 'not_configured', reason: null };
}

function deriveProvider(data, components) {
  if (data.providers?.state === 'unavailable') return { state: 'unavailable', reason: 'PROVIDER_READ_UNAVAILABLE' };
  const items = Array.isArray(data.providers?.items) ? data.providers.items : [];
  if (items.some((item) => item?.state === 'ready' || item?.ready === true)) return { state: 'ready', reason: null };
  return components.providers || { state: 'not_configured', reason: null };
}

function safetyChannels() {
  return `<section class="card section-gap" aria-label="Canales de seguridad"><div class="card__head"><div><h3>Frontera SOURCE / LAB</h3><small>La interfaz no relaja las políticas de automatización.</small></div><span class="badge badge--success">FAIL-CLOSED</span></div><div class="card__body"><div class="grid grid--two"><article class="notice"><strong>SOURCE · SOLO LECTURA</strong><p>Observación e ingesta únicamente. Ninguna acción automática, simulación o respuesta se envía al grupo fuente desde el Command Center.</p></article><article class="notice notice--success"><strong>LAB · QA / SIMULACIÓN</strong><p>Destino controlado para pruebas y respuestas simuladas. No concede autoridad financiera ni habilita settlement automático.</p></article></div></div></section>`;
}

function alertRows(alerts) {
  if (!alerts.length) return '<div class="check-list"><div class="is-good">✓ Sin alertas observables en esta lectura.</div></div>';
  return alerts.map((item) => `<details class="audit-row"><summary><strong>${escapeHtml(item.message)}</strong><small>${escapeHtml(item.severity.toUpperCase())}</small></summary><span>${escapeHtml(item.code)}</span></details>`).join('');
}

function documentRows(documents) {
  return documents.slice(0, 8).map((document) => `<details><summary><strong>${escapeHtml(document.filename || 'Documento')}</strong><span>${escapeHtml(document.classification || 'UNKNOWN')} · ${escapeHtml(document.status || 'unknown')}</span></summary><small>${escapeHtml(document.authority || 'unknown')} · ${escapeHtml(formatDate(document.updatedAt || document.createdAt))}</small></details>`).join('');
}

function shellState(value) {
  if (value.status === 'disabled') {
    return `<section class="card section-gap" data-command-center role="status" aria-live="polite"><div class="card__head"><div><h3>Command Center</h3><small>Actualización pausada hasta que exista un grupo activo válido.</small></div><span class="badge badge--warning">Deshabilitado</span></div><div class="card__body"><p>${escapeHtml(value.error || 'Selecciona un grupo para continuar.')}</p><button class="button" data-action="refresh-command-center" disabled>Actualizar</button></div></section>`;
  }
  if (value.status === 'idle' || value.status === 'loading') {
    return `<section class="card section-gap" data-command-center aria-busy="true" role="status" aria-live="polite"><div class="card__head"><div><h3>Command Center</h3><small>Verificando backend, Bridge, PostgreSQL, providers y agente…</small></div><span class="badge badge--info">Cargando</span></div><div class="card__body"><p class="muted">La lectura operativa no usa caché.</p></div></section>`;
  }
  if (!value.data) {
    const offline = value.status === 'offline';
    return `<section class="card section-gap" data-command-center role="status" aria-live="polite"><div class="card__head"><div><h3>Command Center</h3><small>${offline ? 'No hay conexión para verificar el estado.' : 'No se pudo obtener estado operativo.'}</small></div><span class="badge ${offline ? 'badge--warning' : 'badge--danger'}">${offline ? 'Offline' : 'Error'}</span></div><div class="card__body"><p>${escapeHtml(value.error || 'Estado no disponible.')}</p><button class="button button--primary" data-action="refresh-command-center" ${offline ? 'disabled' : ''}>Reintentar</button></div></section>`;
  }
  return '';
}

export function renderCommandCenter(state) {
  const value = state || initialCommandCenterState();
  const terminalShell = shellState(value);
  if (terminalShell) return terminalShell;

  const data = value.data;
  const components = data.system?.components || {};
  const providerComponent = deriveProvider(data, components);
  const bridge = {
    state: data.bridge?.state || components.bridge?.state || 'not_configured',
    reason: data.bridge?.lastEventAt
      ? `Último evento ${formatDate(data.bridge.lastEventAt)}`
      : data.bridge?.state === 'unavailable' ? 'BRIDGE_READ_UNAVAILABLE' : 'Sin evento reciente'
  };
  const channel = deriveChannel(data, components);
  const agent = {
    state: data.agent?.state || components.agent?.state || 'not_configured',
    reason: data.agent?.mode ? `Modo ${data.agent.mode}` : data.agent?.reason || null
  };
  const alerts = Array.isArray(data.alerts) ? data.alerts : [];
  const documents = Array.isArray(data.documents?.recent) ? data.documents.recent : [];
  const meeting = data.operation?.activeMeeting || null;
  const stale = value.status === 'stale' || value.stale;
  const staleNotice = stale
    ? `<div class="offline-banner" role="status" aria-live="polite">Datos del Command Center sin confirmar · última lectura ${escapeHtml(formatDate(value.updatedAt))}${value.error ? ` · ${escapeHtml(value.error)}` : ''}</div>`
    : '';
  const emptyNotice = value.status === 'empty'
    ? '<div class="notice section-gap" role="status"><strong>Sin datos operativos</strong><p>La consulta fue válida, pero este grupo todavía no tiene carreras, documentos, canales ni alertas que mostrar.</p></div>'
    : '';

  const queueUnavailable = data.queue?.state === 'unavailable';
  const conflictUnavailable = data.conflicts?.state === 'unavailable';
  const documentUnavailable = data.documents?.state === 'unavailable';
  const critical = alerts.some((item) => item.severity === 'critical');

  return `${staleNotice}${emptyNotice}<section class="page-head section-gap" data-command-center><div><h2>Command Center</h2><p>Estado observable del backend canónico para ${escapeHtml(data.scope?.groupKey || 'grupo activo')} · lectura no cacheada.</p></div><div class="page-actions"><span class="badge ${data.system?.ok && !critical ? 'badge--success' : 'badge--warning'}">${data.system?.ok && !critical ? 'OPERATIVO' : 'ATENCIÓN'}</span><button class="button" data-action="refresh-command-center" ${globalThis.navigator?.onLine === false ? 'disabled' : ''}>Actualizar</button></div></section><div class="grid grid--kpi metrics-grid">${componentCard('Backend', components.backend)}${componentCard('PostgreSQL', components.database)}${componentCard('Bridge', bridge)}${componentCard('Canal', channel)}${componentCard('Providers', providerComponent)}${componentCard('Agente', agent)}</div>${safetyChannels()}<div class="grid grid--two section-gap"><section class="card"><div class="card__head"><div><h3>Operación canónica</h3><small>${data.operation?.state === 'unavailable' ? 'Lectura no disponible' : meeting ? escapeHtml(meeting.name) : 'Sin meeting activo'}</small></div><span class="badge ${badgeClass(data.operation?.state)}">${data.operation?.raceCount == null ? 'N/D' : `${data.operation.raceCount} carreras`}</span></div><div class="card__body"><div class="control-stack">${raceLine('Carrera actual', data.operation?.currentRace, data.operation?.state)}${raceLine('Próxima carrera', data.operation?.nextRace, data.operation?.state)}<div><span>Cola pendiente</span><strong>${queueUnavailable ? 'No disponible' : countValue(data.queue?.pending)}</strong><small>${queueUnavailable ? 'Lectura fallida' : `${countValue(data.queue?.failed)} fallidas`}</small></div><div><span>Conflictos</span><strong>${conflictUnavailable ? 'No disponible' : countValue(data.conflicts?.total)}</strong><small>${conflictUnavailable ? 'Lectura fallida' : 'reconciliación + transiciones + agente'}</small></div></div></div></section><section class="card"><div class="card__head"><div><h3>Alertas operativas</h3><small>Evidencia observable; no modifica jugadas ni saldos. Abre cada fila para ver el código completo.</small></div><span class="badge ${critical ? 'badge--danger' : alerts.length ? 'badge--warning' : 'badge--success'}">${alerts.length}</span></div><div class="card__body"><div class="list" aria-live="polite">${alertRows(alerts)}</div></div></section></div><section class="card section-gap"><div class="card__head"><div><h3>Documentos recientes</h3><small>Clasificación, autoridad y estado del motor PDF. Las filas largas son expandibles con teclado.</small></div><span class="badge ${documentUnavailable ? 'badge--danger' : ''}">${documentUnavailable ? 'N/D' : documents.length}</span></div><div class="card__body"><div class="responsive-records">${documentUnavailable ? '<div class="empty"><strong>No disponible</strong><span>No se pudo leer la evidencia documental. Revisa las alertas operativas.</span></div>' : documents.length ? documentRows(documents) : '<div class="empty"><strong>Sin documentos</strong><span>No hay evidencia documental persistida para este grupo.</span></div>'}</div></div></section>`;
}
