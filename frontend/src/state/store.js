import { createDefaultState } from '../data/defaults.js';
import { calculateQuote } from '../core/calculator.js';
import { normalizeLanguage } from '../i18n/locales.js';
import { normalizeThemePreference } from '../design-system/uxContract.v1.js';

const STORAGE_KEY_PREFIX = 'contagest_ve_enterprise_v7_state';
const AUTH_SESSION_KEY = 'contagest_auth_session';
const listeners = new Set();
const clone = (value) => JSON.parse(JSON.stringify(value));
const LOGIN_RENDER_KEYS = new Set(['route', 'pendingMfa', 'profile', 'activeLicense']);

function hashScopePart(value) {
  const input = String(value || 'anonymous');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}
function readAuthSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null'); } catch { return null; }
}
function sessionScope(session = readAuthSession()) {
  const tenantId = session?.tenantId || session?.tenant?.id || 'anonymous';
  const userId = session?.user?.id || session?.userId || 'anonymous';
  return `${hashScopePart(tenantId)}-${hashScopePart(userId)}`;
}
function storageKey(session) { return `${STORAGE_KEY_PREFIX}:${sessionScope(session)}`; }

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const output = Array.isArray(target) ? [...target] : { ...target };
  Object.entries(source).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) output[key] = deepMerge(output[key] || {}, value);
    else output[key] = value;
  });
  return output;
}
function normalizeThemePatch(partial) {
  if (!partial?.settings || !Object.prototype.hasOwnProperty.call(partial.settings, 'theme')) return partial;
  return deepMerge(partial, { settings: { theme: normalizeThemePreference(partial.settings.theme) } });
}
function normalizeCustomerSamples(nextState) {
  const settings = nextState.settings || {};
  if (settings.companyTradeName === 'ContaGest Demo') settings.companyTradeName = 'ContaGest Comercial';
  if (settings.companySlogan === 'Documento comercial tributario · Vista previa de gestión') settings.companySlogan = 'Gestión empresarial, contable y operativa';
  nextState.clients = (nextState.clients || []).map((client) => client.name === 'Empresa Demo C.A.' ? { ...client, name:'Distribuidora Metropolitana C.A.', email:client.email === 'compras@clientedemo.com' ? 'compras@distribuidorametropolitana.com' : client.email } : client);
  nextState.suppliers = (nextState.suppliers || []).map((supplier) => supplier.name === 'Proveedor Demo CA' ? { ...supplier, name:'Suministros Centro C.A.' } : supplier);
  return nextState;
}
function normalize(nextState) {
  nextState.settings = nextState.settings || {};
  nextState.settings.theme = normalizeThemePreference(nextState.settings.theme);
  nextState.settings.lang = normalizeLanguage(nextState.settings.lang);
  normalizeCustomerSamples(nextState);
  const rate = Number(nextState.bcv?.rate || 0);
  nextState.calculation = calculateQuote(nextState.quote, rate);
  return nextState;
}
function hydrate(session) {
  const base = createDefaultState();
  try {
    // Legacy unscoped state is intentionally not migrated: its tenant provenance is unknown.
    const saved = JSON.parse(localStorage.getItem(storageKey(session)) || 'null');
    return normalize(saved ? deepMerge(base, saved) : base);
  } catch { return normalize(base); }
}

let activeScope = sessionScope();
let state = hydrate();
function persist() { localStorage.setItem(`${STORAGE_KEY_PREFIX}:${activeScope}`, JSON.stringify(state)); }
function emit() { listeners.forEach((listener) => listener(clone(state))); }
function shouldEmitLoginSet(previousRoute, partial) {
  if (previousRoute !== 'login' || state.route !== 'login') return true;
  return Object.keys(partial || {}).some((key) => LOGIN_RENDER_KEYS.has(key));
}

export const Store = {
  get() { return clone(state); },
  set(partial) {
    const previousRoute = state.route;
    const normalizedPartial = normalizeThemePatch(partial);
    state = normalize(deepMerge(state, normalizedPartial));
    persist();
    if (shouldEmitLoginSet(previousRoute, normalizedPartial)) emit();
  },
  update(mutator) {
    const previousRoute = state.route;
    const draft = clone(state);
    const result = mutator(draft) || draft;
    state = normalize(result);
    persist();
    if (previousRoute !== 'login' || state.route !== 'login') emit();
  },
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  reset() { state = normalize(createDefaultState()); persist(); emit(); },
  switchSessionScope(session) {
    activeScope = sessionScope(session);
    state = hydrate(session);
    emit();
    return this.get();
  },
  purgeSessionScope(session) {
    const scope = sessionScope(session);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}:${scope}`);
    localStorage.removeItem(STORAGE_KEY_PREFIX);
    if (scope === activeScope) {
      activeScope = sessionScope(null);
      state = normalize(createDefaultState());
      emit();
    }
  },
  export() { return JSON.stringify(state, null, 2); },
  import(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    state = normalize(deepMerge(createDefaultState(), parsed));
    persist(); emit();
  }
};
