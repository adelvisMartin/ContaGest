import {
  initialCommandCenterState,
  refreshCommandCenter,
  renderCommandCenter
} from './command-center.js';

const GROUP_KEY = /^[A-Za-z0-9._:-]{3,120}$/;
const HOST_SELECTOR = '[data-command-center-host]';
const ACTIVE_GROUP_SELECTOR = '[data-action="select-group"].is-active[data-id]';

let state = initialCommandCenterState();
let activeKey = '';
let refreshSequence = 0;
let refreshInFlight = false;
let mountScheduled = false;

export function normalizeGroupKey(value) {
  const key = String(value || '').trim();
  return GROUP_KEY.test(key) ? key : '';
}

export function readActiveGroupKey(root = document) {
  const selected = root.querySelector(ACTIVE_GROUP_SELECTOR);
  return normalizeGroupKey(selected?.dataset?.id);
}

function dashboardAnchor(root = document) {
  return root.querySelector('#app .group-hero');
}

function ensureHost() {
  const anchor = dashboardAnchor();
  if (!anchor) return null;
  const existing = document.querySelector(HOST_SELECTOR);
  if (existing) return existing;
  const host = document.createElement('div');
  host.dataset.commandCenterHost = '';
  host.setAttribute('aria-label', 'Estado operativo de Control Hípico');
  anchor.insertAdjacentElement('afterend', host);
  return host;
}

function renderHost() {
  const host = document.querySelector(HOST_SELECTOR);
  if (host) host.innerHTML = renderCommandCenter(state);
}

async function refresh({ force = false } = {}) {
  const key = readActiveGroupKey();
  if (!key) {
    state = {
      ...initialCommandCenterState(),
      status: 'disabled',
      error: 'Selecciona un grupo válido para habilitar el Command Center.'
    };
    refreshInFlight = false;
    renderHost();
    return;
  }
  if (refreshInFlight) return;

  activeKey = key;
  const sequence = ++refreshSequence;
  refreshInFlight = true;
  state = { ...state, status: 'loading', error: '' };
  renderHost();

  try {
    const next = await refreshCommandCenter(state, { groupKey: key });
    if (sequence !== refreshSequence || key !== readActiveGroupKey()) return;
    state = next;
  } finally {
    if (sequence === refreshSequence) refreshInFlight = false;
  }
  renderHost();
}

function mount() {
  mountScheduled = false;
  const host = ensureHost();
  if (!host) return;

  const key = readActiveGroupKey();
  if (key !== activeKey) {
    activeKey = key;
    state = initialCommandCenterState();
    refreshInFlight = false;
    refreshSequence += 1;
  }
  renderHost();
  if (state.status === 'idle') void refresh();
}

function scheduleMount() {
  if (mountScheduled) return;
  mountScheduled = true;
  queueMicrotask(mount);
}

document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset?.action;
  if (action === 'refresh-command-center') {
    void refresh({ force: true });
    return;
  }
  if (action === 'select-group') scheduleMount();
});

window.addEventListener('online', () => void refresh({ force: true }));
window.addEventListener('offline', () => void refresh({ force: true }));

const appRoot = document.querySelector('#app');
if (appRoot) {
  new MutationObserver(scheduleMount).observe(appRoot, { childList: true, subtree: true });
}
scheduleMount();
