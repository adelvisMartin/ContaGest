import { icon } from './ui.js';

function ensureIcon(button, iconName) {
  if (!(button instanceof HTMLElement)) return;
  if (!button.querySelector('svg')) button.insertAdjacentHTML('afterbegin', icon(iconName));
}

function normalizeOperationalCenter(scope = document) {
  const launcher = scope.querySelector?.('.ops-launcher');
  if (launcher) {
    launcher.setAttribute('aria-label', 'Abrir textos operativos de WhatsApp');
    launcher.setAttribute('title', 'Textos de WhatsApp');
    if (!launcher.querySelector('svg')) launcher.innerHTML = `${icon('chat')}<span>Mensajes</span>`;
  }

  scope.querySelectorAll?.('.ops-icon[data-ops-close]').forEach((button) => {
    button.setAttribute('aria-label', 'Cerrar centro operativo');
    button.setAttribute('title', 'Cerrar');
    button.innerHTML = icon('close');
  });

  scope.querySelectorAll?.('[data-ops-copy]').forEach((button) => {
    const copied = /^Copiado\b/i.test(button.textContent?.trim() || '');
    ensureIcon(button, copied ? 'check' : 'copy');
  });

  scope.querySelectorAll?.('[data-ops-export]').forEach((button) => ensureIcon(button, 'report'));

  scope.querySelectorAll?.('.ops-message summary > span[aria-hidden="true"]').forEach((host) => {
    host.classList.add('ops-chevron');
    host.innerHTML = icon('back');
  });
}

function normalizeUtilityIcons(scope = document) {
  scope.querySelectorAll?.('.hc-help-trigger').forEach((button) => {
    button.setAttribute('title', 'Ayuda');
    if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', 'Abrir manual de uso');
  });
  normalizeOperationalCenter(scope);
}

let queued = false;
function scheduleNormalization() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    normalizeUtilityIcons(document);
  });
}

const root = document.querySelector('#app') || document.body;
new MutationObserver(scheduleNormalization).observe(root, { childList: true, subtree: true, characterData: true });
new MutationObserver(scheduleNormalization).observe(document.body, { childList: true, subtree: false });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleNormalization, { once: true });
else scheduleNormalization();

export { normalizeOperationalCenter, normalizeUtilityIcons };
