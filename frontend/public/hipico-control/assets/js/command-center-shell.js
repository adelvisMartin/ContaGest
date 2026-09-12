import { initialCommandCenterState, refreshCommandCenter, renderCommandCenter } from './command-center.js';

const states = new Map();
const inflight = new Map();
let scheduled = false;

function activeGroupKey() {
  return String(document.querySelector('.group-pill.is-active')?.dataset?.groupKey || document.querySelector('.group-pill.is-active')?.dataset?.id || document.querySelector('.group-metric-card.is-active')?.dataset?.groupKey || document.querySelector('.group-metric-card.is-active')?.dataset?.id || '').trim();
}

function dashboardAnchor() {
  const hero = document.querySelector('.content > .group-hero');
  return hero?.isConnected ? hero : null;
}

function stateFor(groupKey) {
  if (!states.has(groupKey)) states.set(groupKey, initialCommandCenterState());
  return states.get(groupKey);
}

function renderKey(groupKey, state) {
  return [groupKey, state.status, state.updatedAt || '', state.stale ? 'stale' : 'fresh', state.error || ''].join('|');
}

function render(groupKey) {
  const anchor = dashboardAnchor();
  if (!anchor || !groupKey) return;
  let mount = document.querySelector('[data-command-center-mount]');
  if (!mount) {
    mount = document.createElement('div');
    mount.dataset.commandCenterMount = 'true';
    anchor.insertAdjacentElement('afterend', mount);
  }
  const state = stateFor(groupKey);
  const key = renderKey(groupKey, state);
  if (mount.dataset.renderKey === key) return;
  mount.dataset.renderKey = key;
  mount.innerHTML = renderCommandCenter(state);
}

async function load(groupKey, force = false) {
  if (!groupKey || !dashboardAnchor()) return;
  const current = stateFor(groupKey);
  const updatedAt = current.updatedAt ? Date.parse(current.updatedAt) : 0;
  if (!force && current.status === 'success' && Date.now() - updatedAt < 15000) {
    render(groupKey);
    return;
  }
  if (inflight.has(groupKey)) return inflight.get(groupKey);
  states.set(groupKey, { ...current, status: current.data ? current.status : 'loading', error: '' });
  render(groupKey);
  const promise = refreshCommandCenter(states.get(groupKey), { groupKey })
    .then((next) => {
      states.set(groupKey, next);
      if (activeGroupKey() === groupKey) render(groupKey);
      return next;
    })
    .finally(() => inflight.delete(groupKey));
  inflight.set(groupKey, promise);
  return promise;
}

function synchronize() {
  scheduled = false;
  const groupKey = activeGroupKey();
  if (!dashboardAnchor() || !groupKey) return;
  render(groupKey);
  load(groupKey).catch(() => {});
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(synchronize);
}

new MutationObserver((mutations) => {
  const relevant = mutations.some((mutation) => {
    const target = mutation.target;
    return !(target instanceof Element && target.closest('[data-command-center-mount]'));
  });
  if (relevant) schedule();
}).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

document.addEventListener('click', (event) => {
  const button = event.target?.closest?.('[data-action="refresh-command-center"]');
  if (!button) return;
  const groupKey = activeGroupKey();
  if (!groupKey) return;
  load(groupKey, true).catch(() => {});
});

addEventListener('online', () => {
  const groupKey = activeGroupKey();
  if (groupKey) load(groupKey, true).catch(() => {});
});
addEventListener('offline', () => {
  const groupKey = activeGroupKey();
  if (!groupKey) return;
  const current = stateFor(groupKey);
  states.set(groupKey, { ...current, stale: true, status: current.data ? 'success' : 'offline', error: current.data ? '' : 'Sin conexión y sin una lectura previa del Command Center.' });
  render(groupKey);
});

schedule();
