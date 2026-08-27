const ROUTE_PARAM = 'module';
const SAFE_PARAM = /^[a-zA-Z0-9_.:@-]{1,180}$/;
const SAFE_KEYS = new Set([
  ROUTE_PARAM,
  'tab','view','id','patient','member','appointment','encounter','order','study','hospitalization',
  'status','type','kind','category','specialty','search','q','page','pageSize','sort','order',
  'date','dateFrom','dateTo','from','to','filter','modal','step','mode','source','access'
]);
const SIDEBAR_SECTIONS_KEY = 'cg_sidebar_sections_v1126';
const ERP_CANONICAL_PATH = '/';

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
const isMobileSidebar = () => Boolean(window.matchMedia?.('(max-width:1023px)').matches);

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

function readSidebarSections() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SIDEBAR_SECTIONS_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}
function rememberSidebarSections() {
  const open = [...document.querySelectorAll('#mainMenu details[data-sidebar-section][open]')]
    .map((node) => String(node.dataset.sidebarSection || '').trim()).filter(Boolean);
  try { sessionStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(open)); } catch { /* storage may be unavailable */ }
}
function restoreSidebarSections() {
  const sections = [...document.querySelectorAll('#mainMenu details[data-sidebar-section]')];
  if (!sections.length) return;
  const remembered = readSidebarSections();
  sections.forEach((details) => {
    const active = Boolean(details.querySelector('.hf-menu-item.active'));
    const name = String(details.dataset.sidebarSection || '');
    details.open = active || remembered.has(name);
    details.querySelector(':scope > summary')?.setAttribute('aria-expanded', String(details.open));
  });
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
  return { route, params:safe };
}

function buildUrl(route, params = {}) {
  const search = new URLSearchParams();
  search.set(ROUTE_PARAM, cleanRoute(route));
  Object.entries(normalizeParams(params)).forEach(([key, value]) => {
    if (key !== ROUTE_PARAM) search.set(key, value);
  });
  return `${ERP_CANONICAL_PATH}?${search.toString()}`;
}

function notifyStore(route, source = 'url') {
  if (!StoreRef) return;
  navigationRevision += 1;
  StoreRef.set({ route, navigation:{ search:window.location.search, revision:navigationRevision, source } });
}

function write(route, params = {}, { replace = false, notify = true, source = 'app', preserveCurrent = true } = {}) {
  const nextRoute = cleanRoute(route, StoreRef?.get?.().route || 'dashboard');
  const locationState = readLocation(nextRoute);
  const normalized = normalizeParams(params);
  const nextParams = preserveCurrent && nextRoute === locationState.route && Object.keys(normalized).length === 0
    ? locationState.params
    : normalized;
  const nextUrl = buildUrl(nextRoute, nextParams);
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl !== currentUrl) window.history[replace ? 'replaceState' : 'pushState']({ module:nextRoute },'',nextUrl);
  if (notify) notifyStore(nextRoute, source);
  return { route:nextRoute, params:nextParams, url:nextUrl };
}

function eventParams(node) {
  const params = {};
  const raw = node?.dataset?.queryParams;
  if (raw) { try { Object.assign(params, JSON.parse(raw)); } catch { /* ignored */ } }
  if (node?.dataset?.tab) params.tab = node.dataset.tab;
  if (node?.dataset?.view) params.view = node.dataset.view;
  if (node?.dataset?.entityId) params.id = node.dataset.entityId;
  return normalizeParams(params);
}

function routeTriggerFromEvent(event) {
  const origin = event.target instanceof Element ? event.target : null;
  if (!origin) return null;
  if (origin.closest('input,textarea,select,option,[contenteditable="true"],[data-route-ignore]')) return null;
  const target = origin.closest('[data-route],[data-command-route],[data-breadcrumb-route]');
  if (!target || target === document.body || target === document.documentElement) return null;
  return target;
}

function installListeners() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Category headers are accordion controls. They never navigate and therefore never
  // close the mobile drawer. Only a real child route is allowed to trigger navigation.
  document.addEventListener('click', (event) => {
    const origin = event.target instanceof Element ? event.target : null;
    const summary = origin?.closest('#mainMenu .cg-area-toggle');
    if (!summary) return;
    const details = summary.closest('details[data-sidebar-section]');
    if (!details) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    details.open = !details.open;
    summary.setAttribute('aria-expanded', String(details.open));
    rememberSidebarSections();
  }, true);

  document.addEventListener('click', (event) => {
    const target = routeTriggerFromEvent(event);
    if (!target) return;
    const route = target.dataset.route || target.dataset.commandRoute || target.dataset.breadcrumbRoute;
    if (!route || !allowedRoutes.has(route) || target.matches(':disabled,[aria-disabled="true"],.is-locked')) return;
    const fromSidebar = Boolean(target.closest('#mainMenu'));
    const fromCommandPalette = Boolean(target.dataset.commandRoute);
    if (fromSidebar) rememberSidebarSections();
    event.preventDefault();
    if (fromSidebar && isMobileSidebar()) event.stopPropagation();
    const params = eventParams(target);
    // Command-palette items are removed from the DOM as soon as Store rerenders.
    // Complete the current click dispatch first so touch activation never loses
    // the target while the browser is still delivering the event.
    if (fromCommandPalette) queueMicrotask(() => UrlStateService.navigate(route, params));
    else UrlStateService.navigate(route, params);
  }, true);

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('#btnOpenSidebar') : null;
    if (!button) return;
    requestAnimationFrame(restoreSidebarSections);
  }, true);

  document.addEventListener('change', (event) => {
    const field = event.target instanceof Element ? event.target.closest('[data-query-param]') : null;
    if (!field) return;
    const key = field.dataset.queryParam;
    if (!SAFE_KEYS.has(key)) return;
    UrlStateService.setParams({ [key]:field.value }, { replace:true });
  });

  document.addEventListener('click', (event) => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-query-clear]') : null;
    if (!trigger) return;
    event.preventDefault();
    const keys = String(trigger.dataset.queryClear || '').split(',').map((item)=>item.trim()).filter(Boolean);
    UrlStateService.clearParams(keys, { replace:true });
  });

  window.addEventListener('cg:navigate', (event) => {
    const detail = event.detail || {};
    if (!detail.route) return;
    UrlStateService.navigate(detail.route, detail.params || {}, { replace:Boolean(detail.replace), preserveCurrent:detail.preserveCurrent !== false });
  });

  window.addEventListener('popstate', () => {
    const current = StoreRef?.get?.() || {};
    const locationState = readLocation(current.route || 'dashboard');
    notifyStore(locationState.route, 'popstate');
  });

  requestAnimationFrame(restoreSidebarSections);
}

export const UrlStateService = {
  bootstrap({ Store, routes = [] } = {}) {
    StoreRef = Store;
    allowedRoutes = new Set(routes.map((route)=>String(route).toLowerCase()));
    installListeners();
    const current = StoreRef?.get?.() || {};
    const locationState = readLocation(current.route || 'dashboard');
    const hasExplicitRoute = new URLSearchParams(window.location.search).has(ROUTE_PARAM) || Boolean(legacyHashRoute());
    if (hasExplicitRoute && locationState.route !== current.route) notifyStore(locationState.route, 'bootstrap');
    else write(current.route || locationState.route, locationState.params, { replace:true, notify:false, preserveCurrent:false });
    requestAnimationFrame(restoreSidebarSections);
    return this.current();
  },
  current() { const current=StoreRef?.get?.()||{}; return readLocation(current.route||'dashboard'); },
  getParams() { return this.current().params; },
  get(key, fallback = '') { return this.getParams()[key] ?? fallback; },
  navigate(route, params = {}, options = {}) {
    return write(route, params, { replace:Boolean(options.replace), notify:true, source:'navigate', preserveCurrent:options.preserveCurrent !== false });
  },
  ensureRoute(route, { replace = false } = {}) {
    const current=this.current();
    if(current.route===route)return current;
    return write(route, {}, { replace, notify:false, source:'sync', preserveCurrent:false });
  },
  setParams(patch = {}, { replace = true } = {}) {
    const current=this.current();
    const next={...current.params};
    Object.entries(patch).forEach(([key,value])=>{
      if(!SAFE_KEYS.has(key)||key===ROUTE_PARAM)return;
      const normalized=cleanValue(value);
      if(normalized)next[key]=normalized;else delete next[key];
    });
    return write(current.route,next,{replace,notify:true,source:'query',preserveCurrent:false});
  },
  clearParams(keys = [], { replace = true } = {}) {
    const current=this.current();
    const next={...current.params};
    keys.forEach((key)=>delete next[key]);
    return write(current.route,next,{replace,notify:true,source:'query-clear',preserveCurrent:false});
  },
  href(route, params = {}) { return buildUrl(route, params); },
  bindParam(node,key,fallback='') {
    if(!node||!SAFE_KEYS.has(key))return;
    node.dataset.queryParam=key;
    const value=this.get(key,fallback);
    if('value' in node&&value!=='')node.value=value;
  }
};
