const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]';
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');
const GLOBAL_CONTROL_LABELS = [
  ['[data-action="focus-fast"].icon-button', 'Captura rápida'],
  ['[data-action="prev-race"]', 'Carrera anterior'],
  ['[data-action="next-race"]', 'Carrera siguiente'],
  ['.race-arrow--add[data-action="new-race"]', 'Nueva carrera']
];

let activeDialog = null;
let returnFocus = null;
let shellWasInert = false;
let shellPreviousAriaHidden = null;
let backgroundGuardActive = false;
let titleSequence = 0;

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

function labelGlobalControls(root = document) {
  if (!root?.querySelectorAll) return;
  for (const [selector, label] of GLOBAL_CONTROL_LABELS) {
    for (const control of root.querySelectorAll(selector)) {
      if (control instanceof HTMLElement && !control.hasAttribute('aria-label')) control.setAttribute('aria-label', label);
    }
  }
}

function labelCalendarControls(dialog) {
  const previous = dialog.querySelector('[data-action="calendar-prev"]');
  const next = dialog.querySelector('[data-action="calendar-next"]');
  if (previous instanceof HTMLElement && !previous.hasAttribute('aria-label')) previous.setAttribute('aria-label', 'Mes anterior');
  if (next instanceof HTMLElement && !next.hasAttribute('aria-label')) next.setAttribute('aria-label', 'Mes siguiente');
}

function labelDialog(dialog) {
  if (!(dialog instanceof HTMLElement)) return;
  labelCalendarControls(dialog);
  if (dialog.hasAttribute('aria-label') || dialog.hasAttribute('aria-labelledby')) return;
  const heading = dialog.querySelector('h1,h2,h3,h4,[data-dialog-title],.calendar-card__title,header strong');
  if (!(heading instanceof HTMLElement)) return;
  if (!heading.id) heading.id = `hipico-dialog-title-${++titleSequence}`;
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
  // Preserve the element that launched the first overlay even if app rendering
  // replaces the dialog node while the overlay remains logically open.
  if (!returnFocus && document.activeElement instanceof HTMLElement) returnFocus = document.activeElement;
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
  labelGlobalControls(document);
  const dialog = document.querySelector(DIALOG_SELECTOR);
  if (dialog instanceof HTMLElement) {
    if (dialog !== activeDialog) {
      if (activeDialog && !activeDialog.isConnected) activeDialog = null;
      activate(dialog);
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

export const __test__ = { focusable, labelGlobalControls, labelDialog, labelCalendarControls, closeActiveDialog, trapTab, DIALOG_SELECTOR, FOCUSABLE_SELECTOR, GLOBAL_CONTROL_LABELS };
