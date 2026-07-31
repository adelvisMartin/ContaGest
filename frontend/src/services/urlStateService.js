const ROUTE_PARAM = 'module';
const SAFE_PARAM = /^[a-zA-Z0-9_.:@-]{1,180}$/;
const SAFE_KEYS = new Set([
  ROUTE_PARAM,
  'tab','view','id','patient','member','appointment','encounter','order','study','hospitalization',
  'status','type','kind','category','specialty','search','q','page','pageSize','sort','order',
  'date','dateFrom','dateTo','from','to','filter','modal','step','mode'
]);

let StoreRef = null;
let allowedRoutes = new Set();
let installed = false;
let navigationRevision = 0;

const cleanRoute = (value, fallback = 'dashboard') => {
  const route = String(value || '').trim().toLowerCase();
  return allowedRoutes.has(route) ? route : fallback;
};

const cleanKey = (value) => String(value || '').trim();
const cleanValue = (value) => {
  const text = String(value ?? '').trim();
  if (!text || text.length > 180 || !SAFE_PARAM.test(text)) return '';
  return text;
};

function normalizeParams(input = {}) {
  const output = {};
  Object.entries(input).forEach(([rawKey, rawValue]) => {
    const key = cleanKey(rawKey);
    if (!SAFE_KEYS.has(key)) return;
    const value = cleanValue(rawValue);
    if (value) output[key] = value;
  });
  return output;
}

function legacyHashRoute() {
  const raw = window.location.hash.replace(/^#/, '').trim();
  if (!raw) return '';
  if (raw.includes('=')) {
    try { return new URLSearchParams(raw).get(ROUTE_PARAM) || ''; } catch { return ''; }
  }
  return raw.split(/[/?&]/)[0];
}

function readLocation(fallbackRoute = 'dashboard') {
  const params = new URLSearchParams(window.location.search);
  const route = cleanRoute(params.get(ROUTE_PARAM) || legacyHashRoute(), fallbackRoute);
  const safe = {};
  params.forEach((value, key) => {
    if (key === ROUTE_PARAM || !SAFE_KEYS.has(key)) return;
    const normalized = cleanValue(value);
    if (normalized) safe[key] = normalized;
  });
  return { route, params: safe };
}

function buildUrl(route, params = {}) {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = '';
  const search = new URLSearchParams();
  search.set(ROUTE_PARAM, cleanRoute(route));
  Object.entries(normalizeParams(params)).forEach(([key, value]) => {
    if (key !== ROUTE_PARAM) search.set(key, value);
  });
  url.search = search.toString();
  return `${url.pathname}${url.search}`;
}

function notifyStore(route, source = 'url') {
  if (!StoreRef) return;
  navigationRevision += 1;
  StoreRef.set({
    route,
    navigation: {
      search: window.location.search,
      revision: navigationRevision,
      source
    }
  });
}

function write(route, params = {}, { replace = false, notify = true, source = 'app' } = {}) {
  const nextRoute = cleanRoute(route, StoreRef?.get?.().route || 'dashboard');
  const nextUrl = buildUrl(nextRoute, params);
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl !== currentUrl) {
    window.history[replace ? 'replaceState' : 'pushState']({ module: nextRoute }, '', nextUrl);
  }
  if (notify) notifyStore(nextRoute, source);
  return { route: nextRoute, params: normalizeParams(params), url: nextUrl };
}

function eventParams(node) {
  const params = {};
  const raw = node?.dataset?.queryParams;
  if (raw) {
    try { Object.assign(params, JSON.parse(raw)); } catch { /* invalid data attributes are ignored */ }
  }
  if (node?.dataset?.tab) params.tab = node.dataset.tab;
  if (node?.dataset?.view) params.view = node.dataset.view;
  if (node?.dataset?.entityId) params.id = node.dataset.entityId;
  return normalizeParams(params);
}

function installListeners() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-route],[data-command-route],[data-breadcrumb-route]')
      : null;
    if (!target) return;
    const route = target.dataset.route || target.dataset.commandRoute || target.dataset.breadcrumbRoute;
    if (!route || !allowedRoutes.has(route)) return;
    if (target.matches(':disabled,[aria-disabled="true"],.is-locked')) return;
    event.preventDefault();
    UrlStateService.navigate(route, eventParams(target));
  });

  document.addEventListener('change', (event) => {
    const field = event.target instanceof Element ? event.target.closest('[data-query-param]') : null;
    if (!field) return;
    const key = field.dataset.queryParam;
    if (!SAFE_KEYS.has(key)) return;
    UrlStateService.setParams({ [key]: field.value }, { replace: true });
  });

  document.addEventListener('click', (event) => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-query-clear]') : null;
    if (!trigger) return;
    event.preventDefault();
    const keys = String(trigger.dataset.queryClear || '').split(',').map((item) => item.trim()).filter(Boolean);
    UrlStateService.clearParams(keys, { replace: true });
  });

  window.addEventListener('cg:navigate', (event) => {
    const detail = event.detail || {};
    if (!detail.route) return;
    UrlStateService.navigate(detail.route, detail.params || {}, { replace: Boolean(detail.replace) });
  });

  window.addEventListener('popstate', () => {
    const current = StoreRef?.get?.() || {};
    const locationState = readLocation(current.route || 'dashboard');
    notifyStore(locationState.route, 'popstate');
  });
}

export const UrlStateService = {
  bootstrap({ Store, routes = [] } = {}) {
    StoreRef = Store;
    allowedRoutes = new Set(routes.map((route) => String(route).toLowerCase()));
    installListeners();
    const current = StoreRef?.get?.() || {};
    const locationState = readLocation(current.route || 'dashboard');
    const hasExplicitRoute = new URLSearchParams(window.location.search).has(ROUTE_PARAM) || Boolean(legacyHashRoute());
    if (hasExplicitRoute && locationState.route !== current.route) {
      notifyStore(locationState.route, 'bootstrap');
    } else {
      write(current.route || locationState.route, locationState.params, { replace: true, notify: false });
    }
    return this.current();
  },

  current() {
    const current = StoreRef?.get?.() || {};
    return readLocation(current.route || 'dashboard');
  },

  getParams() {
    return this.current().params;
  },

  get(key, fallback = '') {
    return this.getParams()[key] ?? fallback;
  },

  navigate(route, params = {}, options = {}) {
    return write(route, params, { replace: Boolean(options.replace), notify: true, source: 'navigate' });
  },

  ensureRoute(route, { replace = false } = {}) {
    const current = this.current();
    if (current.route === route) return current;
    return write(route, {}, { replace, notify: false, source: 'sync' });
  },

  setParams(patch = {}, { replace = true } = {}) {
    const current = this.current();
    const next = { ...current.params };
    Object.entries(patch).forEach(([key, value]) => {
      if (!SAFE_KEYS.has(key) || key === ROUTE_PARAM) return;
      const normalized = cleanValue(value);
      if (normalized) next[key] = normalized;
      else delete next[key];
    });
    return write(current.route, next, { replace, notify: true, source: 'query' });
  },

  clearParams(keys = [], { replace = true } = {}) {
    const current = this.current();
    const next = { ...current.params };
    keys.forEach((key) => delete next[key]);
    return write(current.route, next, { replace, notify: true, source: 'query-clear' });
  },

  href(route, params = {}) {
    return buildUrl(route, params);
  },

  bindParam(node, key, fallback = '') {
    if (!node || !SAFE_KEYS.has(key)) return;
    node.dataset.queryParam = key;
    const value = this.get(key, fallback);
    if ('value' in node && value !== '') node.value = value;
  }
};
