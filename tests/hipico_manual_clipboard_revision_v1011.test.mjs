import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../frontend/public/hipico-control/assets/js/operational-copy-center.js', import.meta.url), 'utf8');
const executable = source.replace(/^import .*;\s*$/gm, '').replace(/^export (function|const) /gm, '$1 ');
const compile = new Function('env',
  '"use strict"; const {document, Element, navigator, window, icon, escapeHtml} = env;\n' +
  executable + '\nreturn {mountOperationalCopyCenter, resetOperationalCopyCenter, invalidateManualDraftReview, mayCopyManualSuggestion};');

function delay() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

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
    constructor() { super('root'); this.handlers = {}; this.dataset = { opsAuthorized: 'false' }; }
    addEventListener(type, callback) { this.handlers[type] = callback; }
    setAttribute() {}
    removeAttribute() {}
    querySelectorAll() { return []; }
    remove() { this.isConnected = false; }
  }
  const recorded = [], notices = [];
  const controls = {};
  const dialog = {querySelector(selector) { return controls[selector] ?? null; }};
  const draft = new Element('manual-text', dialog); draft.value = '';
  const confirm = new Element('manual-confirm', dialog);
  const copy = new Element('manual-copy', dialog); copy.disabled = true;
  const clear = new Element('manual-clear', dialog);
  controls['[data-ops-manual-text]'] = draft;
  controls['[data-ops-manual-confirm]'] = confirm;
  // Existing review tests simulate an operator who has already attested consent.
  const consent = new Element('manual-consent', dialog); consent.checked = true;
  controls['[data-ops-manual-consent]'] = consent;
  controls['[data-ops-manual-copy]'] = copy;
  let root;
  const document = {
    getElementById() { return root ?? null; },
    createElement() { root = new Root(); return root; },
    body: { append() {} }
  };
  const module = compile({
    document, Element, icon: name => name, escapeHtml: String,
    navigator: { clipboard: { writeText(text) { recorded.push(text); return writeText(text); } } },
    window: {dispatchEvent(e) { notices.push(e); }}
  });
  module.mountOperationalCopyCenter();
  root.dataset.opsAuthorized = 'true';
  function event(kind, target) { return root.handlers[kind]({target}); }
  function edit(text) { draft.value = text; event('input', draft); }
  function review() { confirm.checked = true; event('change', confirm); }
  return { module, root, dialog, draft, confirm, copy, clear, recorded, notices, edit, review, event };
}

test('#1011 successful unchanged reviewed draft is copied once and acknowledged', async () => {
  const h = harness(); h.edit('Aprobado'); h.review();
  await h.event('click', h.copy);
  assert.deepEqual(h.recorded, ['Aprobado']);
  assert.match(h.copy.innerHTML, /Copiado/);
});

test('#1011 changing then restoring identical text while clipboard is pending cannot reuse old approval', async () => {
  const pending = delay();
  const h = harness(() => pending.promise);
  h.edit('Texto original'); h.review();
  const first = h.event('click', h.copy);
  h.edit('Temporal');
  h.edit('Texto original'); h.review();
  assert.equal(h.copy.disabled, true);
  pending.resolve();
  await first;
  assert.deepEqual(h.recorded, ['Texto original']);
  assert.doesNotMatch(h.copy.innerHTML, /Copiado/);
  assert.equal(h.copy.disabled, false);
});

test('#1011 new review cannot re-enable Copy during unresolved clipboard write', async () => {
  const pending = delay();
  const h = harness(() => pending.promise);
  h.edit('Original'); h.review();
  const first = h.event('click', h.copy);
  h.edit('Texto modificado'); h.review();
  assert.equal(h.copy.disabled, true);
  await h.event('click', h.copy);
  assert.equal(h.recorded.length, 1);
  pending.resolve();
  await first;
  assert.equal(h.copy.disabled, false);
  await h.event('click', h.copy);
  assert.deepEqual(h.recorded, ['Original', 'Texto modificado']);
});

test('#1011 clear then re-enter identical text never acknowledges obsolete clipboard promise', async () => {
  const pending = delay();
  const h = harness(() => pending.promise);
  h.edit('Mismo contenido'); h.review();
  const first = h.event('click', h.copy);
  h.event('click', h.clear);
  h.edit('Mismo contenido'); h.review();
  pending.resolve(); await first;
  assert.doesNotMatch(h.copy.innerHTML, /Copiado/);
  assert.deepEqual(h.recorded, ['Mismo contenido']);
});

test('#1011 clear resets Copiado visual state, content, and checkbox', async () => {
  const h = harness();
  h.edit('Solo manual'); h.review();
  await h.event('click', h.copy);
  assert.match(h.copy.innerHTML, /Copiado/);
  h.event('click', h.clear);
  assert.equal(h.draft.value, '');
  assert.equal(h.confirm.checked, false);
  assert.equal(h.copy.disabled, true);
  assert.doesNotMatch(h.copy.innerHTML, /Copiado/);
});

test('#1011 toggling confirmation off then on does not adopt previous inflight clipboard result', async () => {
  const pending = delay();
  const h = harness(() => pending.promise);
  h.edit('Sin cambios'); h.review();
  const first = h.event('click', h.copy);
  h.confirm.checked = false; h.event('change', h.confirm);
  h.review();
  pending.resolve(); await first;
  assert.doesNotMatch(h.copy.innerHTML, /Copiado/);
});

test('#1011 closing/reopening invalidates pending clipboard revision', async () => {
  const pending = delay();
  const h = harness(() => pending.promise);
  h.edit('Contenido'); h.review();
  const first = h.event('click', h.copy);
  // The actual close handler calls this module function before clearing DOM.
  h.module.invalidateManualDraftReview(h.dialog);
  h.edit('Contenido'); h.review();
  pending.resolve(); await first;
  assert.doesNotMatch(h.copy.innerHTML, /Copiado/);
  assert.match(source, /dialog\.addEventListener\('close', \(\) => \{\s*\/\/[^\n]*\n\s*invalidateManualDraftReview\(dialog\)/);
});

test('#1011 clipboard error releases the pending lock, without showing success', async () => {
  const h = harness(async () => { throw new Error('clipboard failed'); });
  h.edit('Intento'); h.review();
  await h.event('click', h.copy);
  assert.equal(h.copy.disabled, false);
  assert.doesNotMatch(h.copy.innerHTML, /Copiado/);
  assert.equal(h.notices.length, 1);
});

test('#1011 session reset during clipboard promise does not show stale success', async () => {
  const pending = delay();
  const h = harness(() => pending.promise);
  h.edit('No persistir'); h.review();
  const first = h.event('click', h.copy);
  h.root.dataset.opsAuthorized = 'false';
  pending.resolve(); await first;
  assert.doesNotMatch(h.copy.innerHTML, /Copiado/);
});

test('#1011 privacy policy, no WhatsApp automation or hidden persistence in new scope', () => {
  const scope = source.slice(source.indexOf("const manualDraftRevisions ="), source.indexOf('\nfunction messageCard('));
  assert.match(scope, /WeakMap/);
  assert.match(scope, /WeakSet/);
  assert.doesNotMatch(scope, /localStorage|sessionStorage|fetch\(|web\.whatsapp\.com|sendMessage|service_role/);
  assert.match(source, /mayCopyManualSuggestion/);
  assert.match(source, /data-ops-manual-confirm/);
});
