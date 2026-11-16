import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const enhancer = read('frontend/src/services/multiTenantEnhancer.js')
  .replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');

function harness({ afterServerSwitchFailure = false, backendFailure = false } = {}) {
  const calls = [];
  const tenantA = {
    tenantId: 'tenant-a', user: { id: 'user-a' },
    accessibleTenants: [
      { tenantId: 'tenant-a', name: 'Empresa A', rif: 'J-0001' },
      { tenantId: 'tenant-b', name: 'Empresa B', rif: 'J-0002' }
    ]
  };
  const tenantB = { ...tenantA, tenantId: 'tenant-b', tenant: { name: 'Empresa B', rif: 'J-0002' } };
  let current = tenantA;
  let select = null;
  const events = [];
  const panel = {
    label: null,
    querySelector(value) {
      if (value === '[data-tenant-switcher]') return this.label;
      if (value === '.hf-user-panel-head') return { nextSibling: null };
      return null;
    },
    appendChild(value) { this.label = value; },
    insertBefore(value) { this.label = value; }
  };
  const document = {
    documentElement: {},
    getElementById: (id) => id === 'userMenuPanel' ? panel : null,
    createElement: (tag) => ({
      tagName: tag, dataset: {}, children: [], innerHTML: '', textContent: '',
      setAttribute(key, value) { this[key] = value; },
      appendChild(child) { this.children.push(child); },
      append(...children) { this.children.push(...children); },
      addEventListener(name, callback) {
        (this.listeners ||= {})[name] = callback;
        if (name === 'change') select = this;
      }
    })
  };
  const context = {
    document,
    AuthSession: {
      get: () => current,
      set: () => { throw new Error('Selector bypassed AuthService'); }
    },
    Store: {
      get: () => ({ profile: {}, settings: {} }),
      set: () => calls.push('apply-new-session-to-store')
    },
    window: {
      dispatchEvent: (event) => events.push({ type: event.type, detail: event.detail }),
      addEventListener: () => {}
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    MutationObserver: class { observe() {} },
    queueMicrotask: (callback) => Promise.resolve().then(callback)
  };
  vm.runInNewContext(enhancer, context, { filename: 'multiTenantEnhancer.js' });
  const install = vm.runInNewContext('installMultiTenantEnhancer', context);

  install(async (id) => {
    calls.push('authorized-switch:' + id);
    if (backendFailure) throw new Error('synthetic backend rejected switch');
    current = tenantB;
    if (afterServerSwitchFailure) throw new Error('OFFLINE_SESSION_PURGE_FAILED');
    return tenantB;
  });
  return {
    async selectTenantB() {
      await Promise.resolve();
      await Promise.resolve();
      assert.ok(select, 'selector must be mounted');
      select.value = 'tenant-b';
      await select.listeners.change();
      return { value: select.value, disabled: select.disabled };
    },
    get current() { return current; },
    calls,
    events
  };
}

test('#1292 actual tenant selector delegates through the authorized lifecycle once', async () => {
  const runtime = harness();
  const selection = await runtime.selectTenantB();
  assert.equal(selection.value, 'tenant-b');
  assert.equal(selection.disabled, false);
  assert.equal(runtime.current.tenantId, 'tenant-b');
  assert.deepEqual(runtime.calls, ['authorized-switch:tenant-b', 'apply-new-session-to-store']);
  assert.deepEqual(runtime.events.map((event) => event.type), ['cg:tenant-switched']);
});

test('#1292 cleanup failure cannot make selector display A while authenticated as B', async () => {
  const runtime = harness({ afterServerSwitchFailure: true });
  const selection = await runtime.selectTenantB();
  assert.equal(selection.value, 'tenant-b');
  assert.equal(runtime.current.tenantId, 'tenant-b');
  assert.deepEqual(runtime.events.map((event) => event.type),
    ['cg:tenant-switched', 'cg:tenant-switch-error']);
  assert.equal(runtime.events[0].detail.cleanupIncomplete, true);
  assert.equal(runtime.events[1].detail.activeTenantId, 'tenant-b');
});

test('#1292 backend rejection leaves A active and restores the selector to A', async () => {
  const runtime = harness({ backendFailure: true });
  const selection = await runtime.selectTenantB();
  assert.equal(selection.value, 'tenant-a');
  assert.equal(runtime.current.tenantId, 'tenant-a');
  assert.deepEqual(runtime.events.map((event) => event.type), ['cg:tenant-switch-error']);
  assert.deepEqual(runtime.calls, ['authorized-switch:tenant-b']);
});

test('#1292 AuthService injects the sole tenant-switch lifecycle without import cycles', () => {
  const auth = read('frontend/src/services/authService.js');
  assert.match(auth, /installMultiTenantEnhancer\(\(tenantId\)=>AuthService\.switchTenant\(tenantId\)\)/);
  assert.doesNotMatch(enhancer, /BackendApi\.request\(['"]\/auth\/switch-tenant/);
  assert.doesNotMatch(enhancer, /AuthSession\.set\(/);
});
