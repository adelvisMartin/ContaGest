import { createDefaultState } from '../data/defaults.js';
import { calculateQuote } from '../core/calculator.js';
import { normalizeLanguage } from '../i18n/locales.js';

const STORAGE_KEY = 'contagest_ve_enterprise_v7_state';
const listeners = new Set();
const clone = (value) => JSON.parse(JSON.stringify(value));
const LOGIN_RENDER_KEYS = new Set(['route', 'pendingMfa', 'profile', 'activeLicense']);
const OFFICIAL_THEMES = new Set(['sector','light','dark','sky','soft-blue','spectrum','executive','finance','enterprise']);

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const output = Array.isArray(target) ? [...target] : { ...target };
  Object.entries(source).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) output[key] = deepMerge(output[key] || {}, value);
    else output[key] = value;
  });
  return output;
}

function normalizePersistedTheme(theme) {
  const value = String(theme || 'light').trim().toLowerCase();
  return OFFICIAL_THEMES.has(value) ? value : 'light';
}

function normalizeThemePatch(partial) {
  if (!partial?.settings || !Object.prototype.hasOwnProperty.call(partial.settings, 'theme')) return partial;
  return deepMerge(partial, { settings: { theme: normalizePersistedTheme(partial.settings.theme) } });
}

function normalizeCustomerSamples(nextState) {
  const settings = nextState.settings || {};
  if (settings.companyTradeName === 'ContaGest Demo') settings.companyTradeName = 'ContaGest Comercial';
  if (settings.companySlogan === 'Documento comercial tributario · Vista previa de gestión') settings.companySlogan = 'Gestión empresarial, contable y operativa';
  nextState.clients = (nextState.clients || []).map((client) => client.name === 'Empresa Demo C.A.' ? { ...client, name:'Distribuidora Metropolitana C.A.', email:client.email === 'compras@clientedemo.com' ? 'compras@distribuidorametropolitana.com' : client.email } : client);
  nextState.suppliers = (nextState.suppliers || []).map((supplier) => supplier.name === 'Proveedor Demo CA' ? { ...supplier, name:'Suministros Centro C.A.' } : supplier);
  return nextState;
}

function hydrate() {
  const base = createDefaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return normalize(saved ? deepMerge(base, saved) : base);
  } catch {
    return normalize(base);
  }
}

function normalize(nextState) {
  nextState.settings = nextState.settings || {};
  nextState.settings.theme = normalizePersistedTheme(nextState.settings.theme);
  nextState.settings.lang = normalizeLanguage(nextState.settings.lang);
  normalizeCustomerSamples(nextState);
  const rate = Number(nextState.bcv?.rate || 0);
  nextState.calculation = calculateQuote(nextState.quote, rate);
  return nextState;
}

let state = hydrate();

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function emit() {
  listeners.forEach((listener) => listener(clone(state)));
}

function shouldEmitLoginSet(previousRoute, partial) {
  if (previousRoute !== 'login' || state.route !== 'login') return true;
  const keys = Object.keys(partial || {});
  return keys.some((key) => LOGIN_RENDER_KEYS.has(key));
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
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset() {
    state = normalize(createDefaultState());
    persist();
    emit();
  },
  export() { return JSON.stringify(state, null, 2); },
  import(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    state = normalize(deepMerge(createDefaultState(), parsed));
    persist();
    emit();
  }
};
