import '../styles/runtime-hotfix-v1110.css';

const PARAM_BY_NAME = {
  q: 'q', search: 'search', query: 'search', status: 'status', type: 'type', kind: 'kind', category: 'category',
  specialty: 'specialty', page: 'page', pageSize: 'pageSize', sort: 'sort', order: 'order', date: 'date',
  dateFrom: 'dateFrom', dateTo: 'dateTo', from: 'from', to: 'to', view: 'view', tab: 'tab', mode: 'mode'
};

const VETERINARY_TAB_BY_LABEL = {
  resumen: 'resumen',
  mascotas: 'pacientes',
  agenda: 'agenda',
  'historia clinica': 'historia',
  laboratorio: 'laboratorio',
  estudios: 'estudios',
  hospitalizacion: 'hospitalizacion',
  procedimientos: 'procedimientos',
  comunicaciones: 'comunicaciones'
};

let installed = false;
let timer = null;
let serviceRef = null;

function normalizedLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function replaceParams(patch = {}) {
  if (!serviceRef) return;
  const current = serviceRef.current();
  const next = { ...current.params };
  Object.entries(patch).forEach(([key, value]) => {
    const text = String(value ?? '').trim();
    if (text) next[key] = text;
    else delete next[key];
  });
  window.history.replaceState({ module: current.route }, '', serviceRef.href(current.route, next));
}

function parameterFor(control) {
  if (control.dataset.queryParam) return control.dataset.queryParam;
  const name = control.getAttribute('name') || control.id || '';
  if (PARAM_BY_NAME[name]) return PARAM_BY_NAME[name];
  if (control.matches('input[type="search"]')) return 'search';
  return '';
}

function install() {
  if (installed) return;
  installed = true;

  document.addEventListener('input', (event) => {
    const control = event.target instanceof Element ? event.target.closest('[data-query-param]') : null;
    if (!control || !['INPUT', 'TEXTAREA'].includes(control.tagName)) return;
    const key = control.dataset.queryParam;
    clearTimeout(timer);
    timer = setTimeout(() => replaceParams({ [key]: control.value }), 260);
  });

  document.addEventListener('change', (event) => {
    const control = event.target instanceof Element ? event.target.closest('[data-query-param]') : null;
    if (!control) return;
    replaceParams({ [control.dataset.queryParam]: control.value });
  });

  document.addEventListener('click', (event) => {
    const veterinaryTab = event.target instanceof Element
      ? event.target.closest('#veterinaryClinicRoot [role="tab"]')
      : null;
    if (veterinaryTab && serviceRef?.current().route === 'veterinaria') {
      const key = VETERINARY_TAB_BY_LABEL[normalizedLabel(veterinaryTab.textContent)];
      if (key) {
        queueMicrotask(() => serviceRef.setParams({ tab: key }, { replace: true }));
        return;
      }
    }

    const pageTrigger = event.target instanceof Element ? event.target.closest('[data-page],[data-sort],[data-view],[data-tab]') : null;
    if (!pageTrigger) return;
    const patch = {};
    if (pageTrigger.dataset.page) patch.page = pageTrigger.dataset.page;
    if (pageTrigger.dataset.sort) patch.sort = pageTrigger.dataset.sort;
    if (pageTrigger.dataset.view) patch.view = pageTrigger.dataset.view;
    if (pageTrigger.dataset.tab) patch.tab = pageTrigger.dataset.tab;
    replaceParams(patch);
  });
}

export const QueryParamEnhancer = {
  mount(root, UrlStateService) {
    serviceRef = UrlStateService;
    install();
    const params = UrlStateService.getParams();
    const controls = [...root.querySelectorAll('input[name],select[name],textarea[name],input[type="search"]')];
    const claimed = new Set();
    controls.forEach((control) => {
      const key = parameterFor(control);
      if (!key || claimed.has(`${key}:${control.form?.id || 'page'}`)) return;
      control.dataset.queryParam = key;
      claimed.add(`${key}:${control.form?.id || 'page'}`);
      if (params[key] !== undefined && String(control.value || '') !== String(params[key])) {
        control.value = params[key];
      }
    });
    root.querySelectorAll('[data-query-href]').forEach((node) => {
      const route = node.dataset.route || UrlStateService.current().route;
      let paramsForLink = {};
      try { paramsForLink = JSON.parse(node.dataset.queryHref || '{}'); } catch { /* ignore */ }
      node.setAttribute('href', UrlStateService.href(route, paramsForLink));
    });
  }
};
