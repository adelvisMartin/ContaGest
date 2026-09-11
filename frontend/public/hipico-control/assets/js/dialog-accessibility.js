const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]';
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

let activeDialog = null;
let returnFocus = null;
let shellWasInert = false;

function visible(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function focusable(dialog) {
  if (!(dialog instanceof HTMLElement)) return [];
  return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(visible);
}

function labelDialog(dialog) {
  if (!(dialog instanceof HTMLElement) || dialog.hasAttribute('aria-label') || dialog.hasAttribute('aria-labelledby')) return;
  const heading = dialog.querySelector('h1,h2,h3,h4,[data-dialog-title]');
  if (!(heading instanceof HTMLElement)) return;
  if (!heading.id) heading.id = `hipico-dialog-title-${crypto.randomUUID()}`;
  dialog.setAttribute('aria-labelledby', heading.id);
}

function setBackgroundInert(enabled) {
  const shell = document.querySelector('.shell');
  if (!(shell instanceof HTMLElement)) return;
  if (enabled) {
    shellWasInert = shell.inert;
    shell.inert = true;
    shell.setAttribute('aria-hidden', 'true');
  } else {
    shell.inert = shellWasInert;
    shell.removeAttribute('aria-hidden');
    shellWasInert = false;
  }
}

function activate(dialog) {
  if (!(dialog instanceof HTMLElement) || dialog === activeDialog) return;
  if (!activeDialog) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeDialog = dialog;
  labelDialog(dialog);
  setBackgroundInert(true);
  queueMicrotask(() => {
    if (activeDialog !== dialog || !dialog.isConnected) return;
    const candidates = focusable(dialog);
    const preferred = dialog.querySelector('[data-autofocus], [data-action="close-modal"], [data-action="close-calendar"]');
    const target = preferred instanceof HTMLElement && visible(preferred) ? preferred : candidates[0] || dialog;
    if (!dialog.hasAttribute('tabindex') && target === dialog) dialog.tabIndex = -1;
    target.focus({ preventScroll: true });
  });
}

function deactivateIfNeeded() {
  if (activeDialog?.isConnected) return;
  activeDialog = document.querySelector(DIALOG_SELECTOR);
  if (activeDialog instanceof HTMLElement) {
    activate(activeDialog);
    return;
  }
  setBackgroundInert(false);
  const target = returnFocus;
  returnFocus = null;
  queueMicrotask(() => {
    if (target?.isConnected && !target.closest('[aria-hidden="true"]')) target.focus({ preventScroll: true });
  });
}

function closeActiveDialog() {
  if (!(activeDialog instanceof HTMLElement)) return false;
  const close = activeDialog.querySelector('[data-action="close-calendar"], [data-action="close-modal"]');
  if (!(close instanceof HTMLElement)) return false;
  close.click();
  return true;
}

function trapTab(event) {
  if (!(activeDialog instanceof HTMLElement)) return;
  const candidates = focusable(activeDialog);
  if (!candidates.length) {
    event.preventDefault();
    activeDialog.focus({ preventScroll: true });
    return;
  }
  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  const current = document.activeElement;
  if (event.shiftKey && (current === first || !activeDialog.contains(current))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && current === last) {
    event.preventDefault();
    first.focus();
  }
}

function scan() {
  const dialog = document.querySelector(DIALOG_SELECTOR);
  if (dialog instanceof HTMLElement) activate(dialog);
  else deactivateIfNeeded();
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (event) => {
    if (!activeDialog?.isConnected) scan();
    if (!activeDialog) return;
    if (event.key === 'Escape') {
      if (closeActiveDialog()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (event.key === 'Tab') trapTab(event);
  }, true);

  const observer = new MutationObserver(() => scan());
  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scan();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

export const __test__ = { focusable, labelDialog, closeActiveDialog, trapTab, DIALOG_SELECTOR, FOCUSABLE_SELECTOR };
