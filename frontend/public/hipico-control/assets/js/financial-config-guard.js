const POSITIVE_RATE_MIN = 0.0001;

function numeric(input) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : null;
}

function setConstraint(input, attributes) {
  if (!(input instanceof HTMLInputElement)) return;
  for (const [name, value] of Object.entries(attributes)) input.setAttribute(name, String(value));
  input.inputMode = 'decimal';
}

export function applyFinancialConstraints(root = document) {
  if (!root?.querySelectorAll) return;
  for (const input of root.querySelectorAll('#settings-form input[name="commission"]')) {
    setConstraint(input, { type: 'number', min: 0, max: 100, step: 0.01, required: '' });
  }
  for (const input of root.querySelectorAll('#settings-form input[name="exchangeRate"], #race-form input[name="exchangeRate"], #group-form input[name="exchangeRate"], #rate-form input[name="rate"]')) {
    setConstraint(input, { type: 'number', min: POSITIVE_RATE_MIN, step: 0.0001, required: '' });
  }
}

export function validateFinancialForm(form) {
  if (!(form instanceof HTMLFormElement)) return null;
  if (form.id === 'settings-form') {
    const commission = form.elements.namedItem('commission');
    const value = numeric(commission);
    if (value == null || value < 0 || value > 100) {
      return { input: commission, message: 'La comisión debe estar entre 0% y 100%.' };
    }
  }
  const rateName = form.id === 'rate-form' ? 'rate' : ['settings-form', 'race-form', 'group-form'].includes(form.id) ? 'exchangeRate' : null;
  if (rateName) {
    const input = form.elements.namedItem(rateName);
    const value = numeric(input);
    if (value == null || value <= 0) {
      return { input, message: 'La tasa Bs/USD debe ser mayor que cero.' };
    }
  }
  return null;
}

function showValidation(result) {
  const input = result?.input;
  if (input instanceof HTMLInputElement) {
    input.setCustomValidity(result.message);
    input.reportValidity();
    input.focus({ preventScroll: false });
  }
  globalThis.dispatchEvent?.(new CustomEvent('hipico:notice', { detail: { message: result.message } }));
}

if (typeof document !== 'undefined') {
  applyFinancialConstraints(document);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) applyFinancialConstraints(node.matches?.('form') ? node.parentElement || node : node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('input', (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input) return;
    if (['commission', 'exchangeRate', 'rate'].includes(input.name)) input.setCustomValidity('');
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form) return;
    applyFinancialConstraints(form);
    const invalid = validateFinancialForm(form);
    if (!invalid) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showValidation(invalid);
  }, true);
}

export const __test__ = { numeric, POSITIVE_RATE_MIN };
