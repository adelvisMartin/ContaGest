const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]';
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');
const FIELD_CONTROL_SELECTOR = ':scope > input:not([type="hidden"]), :scope > select, :scope > textarea, :scope > button';
const ACTION_LABELS = Object.freeze({
  'calendar-prev': 'Mes anterior',
  'calendar-next': 'Mes siguiente',
  'focus-fast': 'Captura rápida'
});

let activeDialog = null;
let returnFocus = null;
let shellWasInert = false;
let shellPreviousAriaHidden = null;
let backgroundGuardActive = false;

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

function hasAccessibleName(element) {
  if (!(element instanceof HTMLElement)) return false;
  return Boolean(
    element.getAttribute('aria-label')?.trim()
    || element.getAttribute('aria-labelledby')?.trim()
    || element.textContent?.trim()
  );
}

function ensureActionLabels(root = document) {
  if (!root?.querySelectorAll) return;
  for (const [action, label] of Object.entries(ACTION_LABELS)) {
    for (const element of root.querySelectorAll(`[data-action="${action}"]`)) {
      if (element instanceof HTMLElement && !hasAccessibleName(element)) element.setAttribute('aria-label', label);
    }
  }
}

function ensureFieldLabels(root = document) {
  if (!root?.querySelectorAll) return;
  for (const label of root.querySelectorAll('.field > label')) {
    if (!(label instanceof HTMLLabelElement) || label.htmlFor || label.querySelector('input,select,textarea,button')) continue;
    const field = label.parentElement;
    const control = field?.querySelector(FIELD_CONTROL_SELECTOR);
    if (!(control instanceof HTMLElement)) continue;
    if (!control.id) control.id = `hipico-field-${crypto.randomUUID()}`;
    label.htmlFor = control.id;
  }
}

function labelDialog(dialog) {
  if (!(dialog instanceof HTMLElement) || dialog.hasAttribute('aria-label') || dialog.hasAttribute('aria-labelledby')) return;
  const heading = dialog.querySelector('h1,h2,h3,h4,[data-dialog-title],header strong');
  if (!(heading instanceof HTMLElement)) return;
  if (!heading.id) heading.id = `hipico-dialog-title-${crypto.randomUUID()}`;
  dialog.setAttribute('aria-labelledby', heading.id);
}

function setBackgroundInert(enabled) {
  const shell = document.querySelector('.shell');
  if (!(shell instanceof HTMLElement)) return;
  if (enabled) {
    if (!backgroundGuardActive) {
      shellWasInert = shell.inert;
      shellPreviousAriaHidden = shell.getAttribute('aria-hidden');
      backgroundGuardActive = true;
    }
    shell.inert = true;
    shell.setAttribute('aria-hidden', 'true');
    return;
  }
  if (!backgroundGuardActive) return;
  shell.inert = shellWasInert;
  if (shellPreviousAriaHidden == null) shell.removeAttribute('aria-hidden');
  else shell.setAttribute('aria-hidden', shellPreviousAriaHidden);
  shellWasInert = false;
  shellPreviousAriaHidden = null;
  backgroundGuardActive = false;
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
  const nextDialog = document.querySelector(DIALOG_SELECTOR);
  activeDialog = null;
  if (nextDialog instanceof HTMLElement) {
    activate(nextDialog);
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
  } else if (!event.shiftKey && (current === last || !activeDialog.contains(current))) {
    event.preventDefault();
    first.focus();
  }
}

function scan() {
  ensureActionLabels(document);
  ensureFieldLabels(document);
  const dialog = document.querySelector(DIALOG_SELECTOR);
  if (dialog instanceof HTMLElement) {
    if (dialog !== activeDialog) {
      if (activeDialog && !activeDialog.isConnected) activeDialog = null;
      activate(dialog);
    } else {
      labelDialog(dialog);
    }
    return;
  }
  deactivateIfNeeded();
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

export const __test__ = { focusable, hasAccessibleName, ensureActionLabels, ensureFieldLabels, labelDialog, closeActiveDialog, trapTab, DIALOG_SELECTOR, FOCUSABLE_SELECTOR, FIELD_CONTROL_SELECTOR, ACTION_LABELS };
