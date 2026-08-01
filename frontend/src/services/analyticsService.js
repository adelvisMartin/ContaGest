import { Store } from '../state/store.js';
import { BackendApi } from './backendApi.js';

const SESSION_KEY = 'contagest_analytics_session';
const BACKEND_ANALYTICS_KEY = 'contagest_analytics_backend_enabled';
const nowIso = () => new Date().toISOString();
const uid = (prefix='evt') => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
let lastPage = null;
let lastPageAt = Date.now();
let flushTimer = null;
let flushing = false;
let globalErrorsBound = false;

function getSessionId() {
  let session = sessionStorage.getItem(SESSION_KEY);
  if (!session) { session = uid('ses'); sessionStorage.setItem(SESSION_KEY, session); }
  return session;
}

function buildEvent(type, payload = {}) {
  const state = Store.get();
  return {
    id:uid('evt'), type, route:state.route, sessionId:getSessionId(),
    user:state.profile?.email || 'anonymous', tenant:state.settings?.companyRif || 'unknown',
    viewport:`${window.innerWidth}x${window.innerHeight}`, language:navigator.language,
    createdAt:nowIso(), payload
  };
}

function saveLocal(event) {
  Store.update((draft) => {
    draft.analytics = draft.analytics || { events:[], visits:{}, sessions:[] };
    draft.analytics.events = [event, ...(draft.analytics.events || [])].slice(0, 1500);
    draft.analytics.visits = draft.analytics.visits || {};
    if (event.type === 'page_view') draft.analytics.visits[event.route] = (draft.analytics.visits[event.route] || 0) + 1;
    draft.analytics.lastEventAt = event.createdAt;
    return draft;
  });
}

async function sendToBackend(events) {
  if (!events?.length || localStorage.getItem(BACKEND_ANALYTICS_KEY) !== 'true' || flushing) return { skipped:true };
  flushing = true;
  try {
    const result = await BackendApi.request('/analytics/events', { method:'POST', body:{ events } });
    localStorage.setItem('contagest_analytics_last_flush', nowIso());
    return result;
  } finally { flushing = false; }
}

function queueFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    const events = (Store.get().analytics?.events || []).slice(0, 50);
    sendToBackend(events).catch((error)=>console.warn('[AnalyticsService] backend unavailable', error.message));
  }, 1200);
}

function filterEvents(events, { from, to, type, route } = {}) {
  const fromDate = from ? new Date(from).getTime() : 0;
  const toDate = to ? new Date(`${to}T23:59:59`).getTime() : Number.MAX_SAFE_INTEGER;
  return events.filter((event) => {
    const time = new Date(event.createdAt || 0).getTime();
    return time >= fromDate && time <= toDate && (!type || type === 'all' || event.type === type) && (!route || route === 'all' || event.route === route);
  });
}

export const AnalyticsService = {
  startSession() {
    if (!globalErrorsBound) {
      globalErrorsBound = true;
      window.addEventListener('error',(event)=>this.trackError(event.error || event.message,{source:'window.error',filename:event.filename||'',line:event.lineno||0,column:event.colno||0}));
      window.addEventListener('unhandledrejection',(event)=>this.trackError(event.reason,{source:'unhandledrejection'}));
    }
    const event = buildEvent('session_start', { referrer:document.referrer || 'direct' });
    saveLocal(event); queueFlush(); return event;
  },
  track(type, payload = {}) {
    const event = buildEvent(type, payload);
    saveLocal(event); queueFlush(); return event;
  },
  trackPageView(route, payload = {}) {
    const now = Date.now();
    if (lastPage && lastPage !== route) this.track('page_time', { route:lastPage, ms:now-lastPageAt });
    if (lastPage === route && now-lastPageAt < 500) return null;
    lastPage = route; lastPageAt = now;
    return this.track('page_view', { ...payload, route });
  },
  trackError(error, context = {}) {
    const message = String(error?.message || error || 'Error desconocido').slice(0, 500);
    return this.track('runtime_error', { message, name:error?.name || 'Error', stack:String(error?.stack || '').slice(0, 1500), ...context });
  },
  trackAction(action, payload = {}) { return this.track('business_action', { action, ...payload }); },
  async flush() {
    const events = (Store.get().analytics?.events || []).slice(0, 100);
    return sendToBackend(events);
  },
  setBackendEnabled(enabled) { localStorage.setItem(BACKEND_ANALYTICS_KEY, String(Boolean(enabled))); },
  backendEnabled() { return localStorage.getItem(BACKEND_ANALYTICS_KEY) === 'true'; },
  filter(state = Store.get(), filters = {}) { return filterEvents(state.analytics?.events || [], filters); },
  summary(state = Store.get(), filters = {}) {
    const events = filterEvents(state.analytics?.events || [], filters);
    const visits = {};
    events.filter((event)=>event.type==='page_view').forEach((event)=>{visits[event.route]=(visits[event.route]||0)+1;});
    const uniqueSessions = new Set(events.map((event)=>event.sessionId).filter(Boolean)).size;
    const topRoutes = Object.entries(visits).sort((a,b)=>b[1]-a[1]).slice(0,12);
    const errors = events.filter((event)=>event.type==='runtime_error');
    const actions = events.filter((event)=>event.type==='business_action');
    const pageTimes = events.filter((event)=>event.type==='page_time').map((event)=>Number(event.payload?.ms||0)).filter((value)=>value>=0&&value<3600000);
    const averagePageMs = pageTimes.length ? Math.round(pageTimes.reduce((sum,value)=>sum+value,0)/pageTimes.length) : 0;
    const errorRoutes = Object.entries(errors.reduce((result,event)=>{result[event.route]=(result[event.route]||0)+1;return result;},{})).sort((a,b)=>b[1]-a[1]);
    return {
      totalEvents:events.length, uniqueSessions, topRoutes, errors:errors.length, actions:actions.length,
      averagePageMs, errorRoutes, lastEventAt:events[0]?.createdAt || state.analytics?.lastEventAt || null,
      backendEnabled:this.backendEnabled(), lastFlushAt:localStorage.getItem('contagest_analytics_last_flush') || null
    };
  }
};
