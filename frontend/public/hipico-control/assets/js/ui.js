const ICONS = Object.freeze({
  dashboard: '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/>',
  home: '<path d="m3 11 9-8 9 8v9h-6v-6H9v6H3z"/>',
  race: '<path d="M5 18c2-5 5-8 10-10l4 2-2 4-4-1-3 7M8 10 5 7m8-2 1-3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  group: '<path d="M16 21v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M16 11h6"/>',
  report: '<path d="M4 20V10m5 10V4m5 16v-7m5 7V7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.38.37.73.6 1 .3.28.7.42 1.1.4h.1v4h-.1c-.4-.02-.8.12-1.1.4-.23.27-.44.62-.6 1Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  logout: '<path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6"/>',
  cloud: '<path d="M17.5 19H6a4 4 0 1 1 .7-7.94A5.5 5.5 0 0 1 17.4 8.5a3.5 3.5 0 0 1 .1 7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chat: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 1 1 5.83 1c-.62 1.25-1.93 1.48-2.43 2.5-.15.31-.2.65-.2 1M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 10v6M12 7h.01"/>',
  alert: '<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>'
});

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

export function icon(name, label = '') {
  const body = ICONS[name] || ICONS.info;
  const aria = label ? ` role="img" aria-label="${escapeHtml(label)}"` : ' aria-hidden="true"';
  return `<svg${aria} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

const classes = (...values) => values.flat().filter(Boolean).join(' ');

export const ui = Object.freeze({
  button(label, { variant = 'default', size = 'default', iconName = '', action = '', type = 'button', className = '', attrs = '' } = {}) {
    const variantClass = variant === 'default' ? '' : `button--${variant}`;
    const sizeClass = size === 'default' ? '' : `button--${size}`;
    return `<button type="${escapeHtml(type)}" class="${classes('button', variantClass, sizeClass, className)}"${action ? ` data-action="${escapeHtml(action)}"` : ''}${attrs ? ` ${attrs}` : ''}>${iconName ? icon(iconName) : ''}<span>${escapeHtml(label)}</span></button>`;
  },
  badge(label, tone = 'neutral', className = '') {
    return `<span class="${classes('badge', tone === 'neutral' ? '' : `badge--${tone}`, className)}">${escapeHtml(label)}</span>`;
  },
  card({ title = '', description = '', body = '', actions = '', className = '' } = {}) {
    const head = title || description || actions ? `<div class="card__head"><div>${title ? `<h3>${escapeHtml(title)}</h3>` : ''}${description ? `<small>${escapeHtml(description)}</small>` : ''}</div>${actions}</div>` : '';
    return `<section class="${classes('card', className)}">${head}<div class="card__body">${body}</div></section>`;
  },
  field({ label = '', name = '', value = '', type = 'text', placeholder = '', help = '', required = false, attrs = '' } = {}) {
    return `<div class="field"><label for="${escapeHtml(name)}">${escapeHtml(label)}</label><input class="input" id="${escapeHtml(name)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''}${attrs ? ` ${attrs}` : ''}>${help ? `<small>${escapeHtml(help)}</small>` : ''}</div>`;
  },
  state(title, description = '', tone = 'neutral') {
    return `<div class="ui-state" data-tone="${escapeHtml(tone)}"><strong class="ui-state__title">${escapeHtml(title)}</strong>${description ? `<span>${escapeHtml(description)}</span>` : ''}</div>`;
  },
  dialog(title, body, { className = '', labelledBy = 'ui-dialog-title' } = {}) {
    return `<div class="modal-backdrop" data-action="close-modal"><section class="${classes('modal', className)}" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(labelledBy)}" data-modal-dialog><div class="modal__handle"></div><div class="modal__head"><h3 id="${escapeHtml(labelledBy)}">${escapeHtml(title)}</h3><button type="button" class="button icon-button button--ghost" data-action="close-modal" aria-label="Cerrar">${icon('close')}</button></div><div class="modal__body">${body}</div></section></div>`;
  }
});

export function statusBadge(status) {
  const tones = { open: 'success', active: 'success', settled: 'info', closed: 'info', locked: 'warning', pending: 'warning', cancelled: 'danger', disabled: 'danger', suspended: 'warning' };
  return ui.badge(status, tones[String(status || '').toLowerCase()] || 'neutral');
}

const TOAST_LABELS = Object.freeze({ success: 'Listo', error: 'No se pudo completar', warning: 'Atención', info: 'Información' });

export function toast(message, type = 'success', options = {}) {
  const region = document.querySelector('#toast-region');
  if (!region) return null;
  const normalizedType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
  const item = document.createElement('div');
  item.className = `toast toast--${normalizedType}`;
  item.setAttribute('role', normalizedType === 'error' ? 'alert' : 'status');
  item.setAttribute('aria-live', normalizedType === 'error' ? 'assertive' : 'polite');
  const iconName = normalizedType === 'success' ? 'check' : normalizedType === 'error' || normalizedType === 'warning' ? 'alert' : 'info';
  item.innerHTML = `<span class="toast__icon">${icon(iconName)}</span><span class="toast__copy"><strong>${escapeHtml(options.title || TOAST_LABELS[normalizedType])}</strong><span>${escapeHtml(message)}</span></span><button type="button" class="toast__close" data-action="dismiss-toast" aria-label="Cerrar notificación">${icon('close')}</button>`;
  const dismiss = () => { item.classList.remove('is-visible'); window.setTimeout(() => item.remove(), 180); };
  item.querySelector('.toast__close')?.addEventListener('click', dismiss);
  region.appendChild(item);
  requestAnimationFrame(() => item.classList.add('is-visible'));
  const duration = Math.max(1800, Math.min(12000, Number(options.duration || (normalizedType === 'error' ? 6200 : 4200))));
  if (!options.persistent) window.setTimeout(dismiss, duration);
  return { dismiss, element: item };
}

let activeDialog = null;
let returnFocus = null;
function focusableNodes(dialog) {
  return [...dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((node) => !node.hidden && node.getAttribute('aria-hidden') !== 'true');
}
function activateDialog(dialog) {
  if (!dialog || dialog === activeDialog) return;
  activeDialog = dialog;
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const nodes = focusableNodes(dialog);
  requestAnimationFrame(() => (nodes[0] || dialog).focus?.());
}
function deactivateDialog() {
  activeDialog = null;
  const target = returnFocus;
  returnFocus = null;
  requestAnimationFrame(() => target?.isConnected && target.focus());
}
function enhanceDialogs(root = document) {
  root.querySelectorAll?.('[data-modal-dialog], [role="dialog"][aria-modal="true"]').forEach((dialog) => {
    if (!(dialog instanceof HTMLElement)) return;
    if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
    if (!dialog.dataset.uiDialogEnhanced) {
      dialog.dataset.uiDialogEnhanced = 'true';
      dialog.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        const nodes = focusableNodes(dialog);
        if (!nodes.length) { event.preventDefault(); dialog.focus(); return; }
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
    }
    activateDialog(dialog);
  });
  if (activeDialog && !activeDialog.isConnected) deactivateDialog();
}

let selectSequence = 0;
function fieldLabel(select) {
  const explicit = select.getAttribute('aria-label');
  if (explicit) return explicit;
  const label = select.id && typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? document.querySelector(`label[for="${CSS.escape(select.id)}"]`)
    : select.closest('.field')?.querySelector('label, span');
  return label?.textContent?.trim() || 'Seleccionar opción';
}
function selectPopover(shell) {
  const id = shell?.querySelector('.select-trigger')?.getAttribute('aria-controls');
  return id ? document.getElementById(id) : null;
}
function enabledOptions(popover) {
  return [...popover.querySelectorAll('.select-option:not([disabled])')];
}
function focusOption(popover, index) {
  const options = enabledOptions(popover);
  if (!options.length) return;
  options[Math.max(0, Math.min(options.length - 1, index))]?.focus();
}
function positionSelectPopover(trigger, popover) {
  if (!(trigger instanceof HTMLElement) || !(popover instanceof HTMLElement)) return;
  popover.style.removeProperty('bottom');
  if (window.matchMedia('(max-width: 780px)').matches) {
    popover.style.removeProperty('top');
    popover.style.removeProperty('left');
    popover.style.removeProperty('width');
    return;
  }
  const rect = trigger.getBoundingClientRect();
  const gap = 5;
  const below = window.innerHeight - rect.bottom - gap;
  const above = rect.top - gap;
  popover.style.left = `${Math.max(8, rect.left)}px`;
  popover.style.width = `${Math.max(160, rect.width)}px`;
  if (below < 180 && above > below) {
    popover.style.removeProperty('top');
    popover.style.bottom = `${Math.max(8, window.innerHeight - rect.top + gap)}px`;
  } else {
    popover.style.removeProperty('bottom');
    popover.style.top = `${Math.max(8, rect.bottom + gap)}px`;
  }
}
function closeSelect(shell, { returnFocus = false } = {}) {
  if (!(shell instanceof HTMLElement)) return;
  const trigger = shell.querySelector('.select-trigger');
  const popover = selectPopover(shell);
  if (!(trigger instanceof HTMLElement) || !(popover instanceof HTMLElement)) return;
  popover.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  shell.classList.remove('is-open');
  if (returnFocus) trigger.focus();
}
function openSelect(shell, direction = 1) {
  if (!(shell instanceof HTMLElement)) return;
  const trigger = shell.querySelector('.select-trigger');
  const popover = selectPopover(shell);
  if (!(trigger instanceof HTMLElement) || !(popover instanceof HTMLElement)) return;
  document.querySelectorAll('.select-shell.is-open').forEach((openShell) => { if (openShell !== shell) closeSelect(openShell); });
  positionSelectPopover(trigger, popover);
  popover.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  shell.classList.add('is-open');
  const options = enabledOptions(popover);
  const selectedIndex = options.findIndex((option) => option.getAttribute('aria-selected') === 'true');
  const fallback = direction < 0 ? options.length - 1 : 0;
  requestAnimationFrame(() => focusOption(popover, selectedIndex >= 0 ? selectedIndex : fallback));
}
function syncEnhancedSelect(select, trigger, popover) {
  const selected = select.options[select.selectedIndex] || select.options[0];
  const valueNode = trigger.querySelector('.select-trigger__value');
  if (valueNode) valueNode.textContent = selected?.textContent?.trim() || '';
  trigger.disabled = select.disabled;
  popover.querySelectorAll('.select-option').forEach((option) => {
    const active = option.dataset.value === String(select.value);
    option.setAttribute('aria-selected', active ? 'true' : 'false');
    option.classList.toggle('is-selected', active);
  });
}
function selectByOption(select, trigger, popover, option) {
  if (!(option instanceof HTMLElement) || option.hasAttribute('disabled')) return;
  select.value = option.dataset.value ?? '';
  syncEnhancedSelect(select, trigger, popover);
  select.dispatchEvent(new Event('change', { bubbles: true }));
  closeSelect(trigger.closest('.select-shell'), { returnFocus: true });
}
function cleanupSelectPortals() {
  document.querySelectorAll('.select-popover[data-select-owner]').forEach((popover) => {
    if (!document.getElementById(popover.dataset.selectOwner || '')) popover.remove();
  });
}
export function enhanceSelects(root = document) {
  root.querySelectorAll?.('select.select:not([data-ui-select-enhanced])').forEach((select) => {
    if (!(select instanceof HTMLSelectElement)) return;
    select.dataset.uiSelectEnhanced = 'true';
    selectSequence += 1;
    const shell = document.createElement('div');
    shell.className = 'select-shell';
    shell.id = `hc-select-shell-${selectSequence}`;
    const listboxId = `hc-select-${selectSequence}`;
    const template = document.createElement('template');
    template.innerHTML = `<button type="button" class="select-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listboxId}"><span class="select-trigger__value"></span><span class="select-trigger__chevron" aria-hidden="true"></span></button><div class="select-popover" id="${listboxId}" role="listbox" hidden></div>`;
    const trigger = template.content.querySelector('.select-trigger');
    const popover = template.content.querySelector('.select-popover');
    if (!(trigger instanceof HTMLButtonElement) || !(popover instanceof HTMLElement)) return;
    const label = fieldLabel(select);
    trigger.setAttribute('aria-label', label);
    popover.setAttribute('aria-label', label);
    popover.dataset.selectOwner = shell.id;
    [...select.options].forEach((nativeOption) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'select-option';
      option.setAttribute('role', 'option');
      option.dataset.value = nativeOption.value;
      option.textContent = nativeOption.textContent || nativeOption.value;
      if (nativeOption.disabled) option.disabled = true;
      option.addEventListener('click', () => selectByOption(select, trigger, popover, option));
      option.addEventListener('keydown', (event) => {
        const options = enabledOptions(popover);
        const index = options.indexOf(option);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          focusOption(popover, index + (event.key === 'ArrowDown' ? 1 : -1));
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          focusOption(popover, event.key === 'Home' ? 0 : options.length - 1);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          closeSelect(shell, { returnFocus: true });
        }
      });
      popover.appendChild(option);
    });
    select.parentNode?.insertBefore(shell, select);
    shell.append(select, trigger);
    document.body.appendChild(popover);
    select.classList.add('select--native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    syncEnhancedSelect(select, trigger, popover);
    trigger.addEventListener('click', () => shell.classList.contains('is-open') ? closeSelect(shell) : openSelect(shell));
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openSelect(shell, event.key === 'ArrowDown' ? 1 : -1);
      } else if (event.key === 'Escape') {
        closeSelect(shell);
      }
    });
    select.addEventListener('change', () => syncEnhancedSelect(select, trigger, popover));
    select.form?.addEventListener('reset', () => requestAnimationFrame(() => syncEnhancedSelect(select, trigger, popover)));
  });
  cleanupSelectPortals();
}

export function enhanceRaceSwitcher(root = document) {
  root.querySelectorAll?.('.race-arrow--add[data-action="new-race"]:not([data-ui-race-switcher])').forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    button.dataset.uiRaceSwitcher = 'true';
    button.classList.add('race-change-action');
    button.setAttribute('aria-label', 'Cambiar carrera');
    button.title = 'Cambiar carrera';
    button.innerHTML = `${icon('plus')}<span>Cambiar carrera</span>`;
  });
}

function enhanceUi(root = document) {
  enhanceDialogs(root);
  enhanceSelects(root);
  enhanceRaceSwitcher(root);
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (typeof MutationObserver === 'function') {
    const dialogObserver = new MutationObserver(() => enhanceUi());
    if (document.documentElement) dialogObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  window.addEventListener('DOMContentLoaded', () => enhanceUi());
  window.addEventListener('resize', () => document.querySelectorAll('.select-shell.is-open').forEach((shell) => closeSelect(shell)));
  window.addEventListener('scroll', () => document.querySelectorAll('.select-shell.is-open').forEach((shell) => closeSelect(shell)), true);
  document.addEventListener('pointerdown', (event) => {
    document.querySelectorAll('.select-shell.is-open').forEach((shell) => {
      const popover = selectPopover(shell);
      if (!shell.contains(event.target) && !popover?.contains(event.target)) closeSelect(shell);
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const openSelectShell = document.querySelector('.select-shell.is-open');
      if (openSelectShell) { event.preventDefault(); closeSelect(openSelectShell, { returnFocus: true }); return; }
    }
    if (event.key !== 'Escape' || !activeDialog) return;
    const close = activeDialog.querySelector('[data-action="close-modal"], [data-help-close]');
    if (close instanceof HTMLElement) { event.preventDefault(); close.click(); }
  });
}
