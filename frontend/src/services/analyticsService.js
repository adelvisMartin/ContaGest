import { Store } from '../state/store.js';
import { BackendApi } from './backendApi.js';

const SESSION_KEY = 'contagest_analytics_session';
const BACKEND_ANALYTICS_KEY = 'contagest_analytics_backend_enabled';
const nowIso = () => new Date().toISOString();
const uid = (prefix='evt') => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
let lastPage = null;
let lastPageAt = Date.now();
let flushTimer = null;

function getSessionId() {
  let session = sessionStorage.getItem(SESSION_KEY);
  if (!session) {
    session = uid('ses');
    sessionStorage.setItem(SESSION_KEY, session);
  }
  return session;
}

function buildEvent(type, payload = {}) {
  const state = Store.get();
  return {
    id: uid('evt'),
    type,
    route: state.route,
    sessionId: getSessionId(),
    user: state.profile?.email || 'demo',
    tenant: state.settings?.companyRif || 'demo',
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language,
    createdAt: nowIso(),
    payload
  };
}

function saveLocal(event) {
  Store.update((draft) => {
    draft.analytics = draft.analytics || { events: [], visits: {}, sessions: [] };
    draft.analytics.events = [event, ...(draft.analytics.events || [])].slice(0, 800);
    draft.analytics.visits = draft.analytics.visits || {};
    if (event.type === 'page_view') draft.analytics.visits[event.route] = (draft.analytics.visits[event.route] || 0) + 1;
    draft.analytics.lastEventAt = event.createdAt;
    return draft;
  });
}

async function sendToBackend(events) {
  if (!events?.length) return;
  if (localStorage.getItem(BACKEND_ANALYTICS_KEY) !== 'true') return;
  try {
    await BackendApi.request('/analytics/events', { method: 'POST', body: { events } });
  } catch (error) {
    console.warn('[AnalyticsService] backend unavailable, local analytics only', error.message);
  }
}

function queueFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    const events = (Store.get().analytics?.events || []).slice(0, 25);
    sendToBackend(events);
  }, 900);
}

export const AnalyticsService = {
  startSession() {
    const event = buildEvent('session_start', { referrer: document.referrer || 'direct' });
    saveLocal(event);
    queueFlush();
  },
  track(type, payload = {}) {
    const event = buildEvent(type, payload);
    saveLocal(event);
    queueFlush();
    return event;
  },
  trackPageView(route, payload = {}) {
    const now = Date.now();
    if (lastPage && lastPage !== route) this.track('page_time', { route: lastPage, ms: now - lastPageAt });
    if (lastPage === route && now - lastPageAt < 500) return null;
    lastPage = route;
    lastPageAt = now;
    return this.track('page_view', { ...payload, route });
  },
  summary(state = Store.get()) {
    const events = state.analytics?.events || [];
    const visits = state.analytics?.visits || {};
    const today = new Date().toISOString().slice(0,10);
    const todayEvents = events.filter((e) => String(e.createdAt || '').startsWith(today));
    const uniqueSessions = new Set(events.map((e) => e.sessionId).filter(Boolean)).size;
    const topRoutes = Object.entries(visits).sort((a,b) => b[1] - a[1]).slice(0, 12);
    return { totalEvents: events.length, todayEvents: todayEvents.length, uniqueSessions, topRoutes, lastEventAt: state.analytics?.lastEventAt || null };
  }
};
