import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../frontend/public/hipico-control/assets/js/operational-copy-center.js', import.meta.url), 'utf8');
const executable = source
  .replace(/^import .*;\s*$/gm, '')
  .replace(/^export (function|const) /gm, '$1 ');
const compile = new Function('environment',
  '"use strict"; const {document, Element, navigator, window, icon, escapeHtml} = environment;\n' +
  executable + '\nreturn {mayCopyManualSuggestion, mountOperationalCopyCenter, resetOperationalCopyCenter};');

function harness(writeText = async () => {}) {
  class Element {
    constructor(kind, dialog = null) {
      this.kind = kind;
      this.dialog = dialog;
      this.disabled = false;
      this.checked = false;
      this.isConnected = true;
      this.innerHTML = '';
    }
    closest(selector) {
      if (selector === 'dialog') return this.dialog;
      if (selector === '[data-ops-' + this.kind + ']') return this;
      return null;
    }
    matches(selector) { return selector === '[data-ops-' + this.kind + ']'; }
  }
  class Root extends Element {
    constructor() {
      super('root');
      this.dataset = { opsAuthorized: 'false' };
      this.handlers = {};
    }
    addEventListener(name, callback) { this.handlers[name] = callback; }
    setAttribute() {}
    removeAttribute() {}
    querySelectorAll() { return []; }
    remove() { this.isConnected = false; }
  }

  let root = null;
  const copies = [];
  const notices = [];
  const dialog = { querySelector(selector) { return controls[selector] ?? null; } };
  const draft = new Element('manual-text', dialog);
  const confirmation = new Element('manual-confirm', dialog);
  const copy = new Element('manual-copy', dialog);
  const cancel = new Element('manual-clear', dialog);
  draft.value = '';
  copy.disabled = true;
  const consent = new Element('manual-consent', dialog);
  consent.checked = true; // Pre-existing clipboard-review regression fixture.
  const controls = {
    '[data-ops-manual-text]': draft,
    '[data-ops-manual-confirm]': confirmation,
    '[data-ops-manual-consent]': consent,
    '[data-ops-manual-copy]': copy
  };
  const document = {
    getElementById() { return root; },
    createElement() { root = new Root(); return root; },
    body: { append() {} }
  };
  const module = compile({
    document, Element,
    navigator: { clipboard: { writeText(text) { copies.push(text); return writeText(text); } } },
    window: { dispatchEvent(event) { notices.push(event); } },
    icon: name => name,
    escapeHtml: value => String(value)
  });
  module.mountOperationalCopyCenter();
  const event = (type, target) => root.handlers[type]({ target });
  return { module, root, draft, confirmation, copy, cancel, copies, notices, event };
}

test('#1011 copy unavailable without human review', async () => {
  const h = harness();
  h.root.dataset.opsAuthorized = 'true';
  h.draft.value = 'Texto escrito por mí';
  h.event('input', h.draft);
  assert.equal(h.copy.disabled, true);
  await h.event('click', h.copy);
  assert.deepEqual(h.copies, []);
});

test('#1011 explicit confirmation unlocks reviewed text and copies exactly human text', async () => {
  const h = harness();
  h.root.dataset.opsAuthorized = 'true';
  h.draft.value = '   Información recreativa   ';
  h.event('input', h.draft);
  h.confirmation.checked = true;
  h.event('change', h.confirmation);
  assert.equal(h.copy.disabled, false);
  await h.event('click', h.copy);
  assert.deepEqual(h.copies, ['Información recreativa']);
  assert.match(h.copy.innerHTML, /Copiado/);
});

test('#1011 any edit after confirmation revokes it before the next copy', async () => {
  const h = harness();
  h.root.dataset.opsAuthorized = 'true';
  h.draft.value = 'Primera versión';
  h.event('input', h.draft);
  h.confirmation.checked = true;
  h.event('change', h.confirmation);
  h.draft.value = 'Versión posterior no revisada';
  h.event('input', h.draft);
  assert.equal(h.confirmation.checked, false);
  assert.equal(h.copy.disabled, true);
  await h.event('click', h.copy);
  assert.deepEqual(h.copies, []);
});

test('#1011 editing after a copied draft resets Copiado evidence', async () => {
  const h = harness();
  h.root.dataset.opsAuthorized = 'true';
  h.draft.value = 'Revisado';
  h.event('input', h.draft);
  h.confirmation.checked = true;
  h.event('change', h.confirmation);
  await h.event('click', h.copy);
  assert.match(h.copy.innerHTML, /Copiado/);
  h.draft.value = 'Cambiado';
  h.event('input', h.draft);
  assert.doesNotMatch(h.copy.innerHTML, /Copiado/);
  assert.equal(h.confirmation.checked, false);
});

test('#1011 cancel-and-clear removes draft and review without persisting', () => {
  const h = harness();
  h.root.dataset.opsAuthorized = 'true';
  h.draft.value = 'Privado';
  h.confirmation.checked = true;
  h.event('click', h.cancel);
  assert.equal(h.draft.value, '');
  assert.equal(h.confirmation.checked, false);
  assert.equal(h.copy.disabled, true);
});

test('#1011 in-flight clipboard write disables duplicate clicks', async () => {
  let complete;
  const h = harness(() => new Promise(resolve => { complete = resolve; }));
  h.root.dataset.opsAuthorized = 'true';
  h.draft.value = 'Revisado';
  h.event('input', h.draft);
  h.confirmation.checked = true;
  h.event('change', h.confirmation);
  const first = h.event('click', h.copy);
  assert.equal(h.copy.disabled, true);
  await h.event('click', h.copy);
  assert.equal(h.copies.length, 1);
  complete();
  await first;
  assert.equal(h.copy.disabled, false);
});

test('#1011 editing during clipboard promise cannot present stale Copiado', async () => {
  let complete;
  const h = harness(() => new Promise(resolve => { complete = resolve; }));
  h.root.dataset.opsAuthorized = 'true';
  h.draft.value = 'Primero';
  h.event('input', h.draft);
  h.confirmation.checked = true;
  h.event('change', h.confirmation);
  const pending = h.event('click', h.copy);
  h.draft.value = 'Editado durante copia';
  h.event('input', h.draft);
  complete();
  await pending;
  assert.deepEqual(h.copies, ['Primero']);
  assert.equal(h.confirmation.checked, false);
  assert.equal(h.copy.disabled, true);
  assert.doesNotMatch(h.copy.innerHTML, /Copiado/);
});

test('#1011 clipboard rejection restores actionable review controls', async () => {
  const h = harness(async () => { throw new Error('clipboard unavailable'); });
  h.root.dataset.opsAuthorized = 'true';
  h.draft.value = 'Verificado';
  h.event('input', h.draft);
  h.confirmation.checked = true;
  h.event('change', h.confirmation);
  await h.event('click', h.copy);
  assert.equal(h.copy.disabled, false);
  assert.equal(h.notices.length, 1);
  assert.doesNotMatch(h.copy.innerHTML, /Copiado/);
});

test('#1011 no authorization means no clipboard write', async () => {
  const h = harness();
  h.draft.value = 'Verificado';
  h.confirmation.checked = true;
  await h.event('click', h.copy);
  assert.deepEqual(h.copies, []);
});

test('#1011 reset clears the authorized root before future actions', async () => {
  const h = harness();
  h.root.dataset.opsAuthorized = 'true';
  h.module.resetOperationalCopyCenter();
  assert.equal(h.root.dataset.opsAuthorized, 'false');
  assert.equal(h.root.isConnected, false);
});

test('#1011 source retains blank editing surface and no WhatsApp/provider operations', () => {
  const section = source.slice(source.indexOf('function manualSuggestionCard()'),
    source.indexOf('\nfunction updateManualSuggestionControls('));
  assert.match(section, /<textarea[^>]*data-ops-manual-text[^>]*><\/textarea>/);
  assert.match(section, /Fuente: texto introducido por una persona/);
  assert.match(section, /Fecha:/);
  assert.match(section, /data-ops-manual-confirm/);
  assert.doesNotMatch(section, /readonly|fetch\(|sendMessage|wa\.me|web\.whatsapp\.com/);
});

test('#1011 policy respects explicit checkbox and <=1200 characters', () => {
  const h = harness();
  const f = h.module.mayCopyManualSuggestion;
  assert.equal(f('A'.repeat(1200), true), true);
  assert.equal(f('A'.repeat(1201), true), false);
  assert.equal(f('      ', true), false);
  assert.equal(f('Hola', 'true'), false);
});
