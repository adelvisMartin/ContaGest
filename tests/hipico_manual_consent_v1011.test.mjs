import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../frontend/public/hipico-control/assets/js/operational-copy-center.js', import.meta.url), 'utf8');
const executable = source.replace(/^import .*;\s*$/gm, '').replace(/^export (function|const) /gm, '$1 ');
const compile = new Function('env',
  '"use strict"; const {document, Element, navigator, window, icon, escapeHtml} = env;\n' +
  executable + '\nreturn {mountOperationalCopyCenter, manualSuggestionCard};');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(writeText = async () => {}) {
  class Element {
    constructor(kind, dialog = null) {
      this.kind = kind;
      this.dialog = dialog;
      this.disabled = false;
      this.checked = false;
      this.innerHTML = '';
      this.isConnected = true;
    }
    closest(selector) {
      if (selector === 'dialog') return this.dialog;
      return selector === '[data-ops-' + this.kind + ']' ? this : null;
    }
    matches(selector) { return selector === '[data-ops-' + this.kind + ']'; }
  }
  class Root extends Element {
    constructor() { super('root'); this.handlers = {}; this.dataset = { opsAuthorized: 'false' }; }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    setAttribute() {}
    querySelectorAll() { return []; }
    remove() { this.isConnected = false; }
  }
  const written = [];
  const dialog = { querySelector(selector) { return controls[selector] ?? null; } };
  const draft = new Element('manual-text', dialog); draft.value = '';
  const review = new Element('manual-confirm', dialog);
  const consent = new Element('manual-consent', dialog);
  const copy = new Element('manual-copy', dialog); copy.disabled = true;
  const cancel = new Element('manual-clear', dialog);
  const controls = {
    '[data-ops-manual-text]': draft,
    '[data-ops-manual-confirm]': review,
    '[data-ops-manual-consent]': consent,
    '[data-ops-manual-copy]': copy
  };
  let root;
  const document = {
    getElementById() { return root ?? null; },
    createElement() { root = new Root(); return root; },
    body: { append() {} }
  };
  const module = compile({
    document, Element, icon: String, escapeHtml: String,
    navigator: { clipboard: { writeText(text) { written.push(text); return writeText(text); } } },
    window: { dispatchEvent() {} }
  });
  module.mountOperationalCopyCenter();
  root.dataset.opsAuthorized = 'true';
  function event(type, target) { return root.handlers[type]({ target }); }
  function edit(value) { draft.value = value; event('input', draft); }
  function attest(value = true) { consent.checked = value; event('change', consent); }
  function approve(value = true) { review.checked = value; event('change', review); }
  return { module, root, draft, review, consent, copy, cancel, written, event, edit, attest, approve };
}

test('#1011 privacy consent defaults to off even when text is reviewed', async () => {
  const h = harness(); h.edit('Prueba sin datos privados'); h.approve();
  assert.equal(h.consent.checked, false);
  assert.equal(h.copy.disabled, true);
  await h.event('click', h.copy);
  assert.deepEqual(h.written, []);
});

test('#1011 declared group consent without reviewed draft does not permit copying', async () => {
  const h = harness(); h.edit('Saludo'); h.attest();
  assert.equal(h.review.checked, false);
  assert.equal(h.copy.disabled, true);
  await h.event('click', h.copy);
  assert.deepEqual(h.written, []);
});

test('#1011 consent + explicit review copy only the current human-authored draft', async () => {
  const h = harness(); h.edit('  Jornada amistosa  '); h.attest(); h.approve();
  assert.equal(h.copy.disabled, false);
  await h.event('click', h.copy);
  assert.deepEqual(h.written, ['Jornada amistosa']);
  assert.match(h.copy.innerHTML, /Copiado/);
});

test('#1011 revoking or regranting consent requires renewed content review', async () => {
  const h = harness(); h.edit('Información recreativa'); h.attest(); h.approve();
  h.attest(false);
  assert.equal(h.review.checked, false);
  assert.equal(h.copy.disabled, true);
  h.attest(true);
  assert.equal(h.copy.disabled, true);
  await h.event('click', h.copy);
  assert.deepEqual(h.written, []);
  h.approve();
  assert.equal(h.copy.disabled, false);
});

test('#1011 revoked/regranted consent cannot acknowledge an obsolete clipboard promise', async () => {
  const pending = deferred();
  const h = harness(() => pending.promise);
  h.edit('Original'); h.attest(); h.approve();
  const first = h.event('click', h.copy);
  h.attest(false); h.attest(true); h.approve();
  assert.equal(h.copy.disabled, true, 'in-flight lock is independent of consent');
  await h.event('click', h.copy);
  assert.deepEqual(h.written, ['Original']);
  pending.resolve();
  await first;
  assert.doesNotMatch(h.copy.innerHTML, /Copiado/);
  assert.equal(h.copy.disabled, false);
});

test('#1011 cancelling wipes both confirmations and draft', async () => {
  const h = harness(); h.edit('Privado'); h.attest(); h.approve();
  await h.event('click', h.copy);
  h.event('click', h.cancel);
  assert.equal(h.draft.value, '');
  assert.equal(h.review.checked, false);
  assert.equal(h.consent.checked, false);
  assert.equal(h.copy.disabled, true);
  assert.doesNotMatch(h.copy.innerHTML, /Copiado/);
});

test('#1011 visible informed consent, no prechecked permission and no SOURCE or ledger operations', () => {
  const h = harness();
  const view = h.module.manualSuggestionCard();
  assert.match(view, /data-ops-manual-consent/);
  assert.match(view, /grupo ha autorizado/);
  assert.match(view, /datos privados de terceros/);
  assert.match(view, /Ambas confirmaciones son necesarias/);
  assert.doesNotMatch(view, /data-ops-manual-consent[^>]*checked/);
  const manualPath = source.slice(source.indexOf('const manualDraftRevisions ='), source.indexOf('\nfunction messageCard('));
  assert.doesNotMatch(manualPath, /localStorage|sessionStorage|fetch\(|sendMessage|web\.whatsapp\.com|runFinancialIdempotentMutation/);
  assert.match(source, /SOURCE_AUTO_READ_POLICY_NO_GO|data-ops-manual-consent/);
});
