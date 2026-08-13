import { createDefaultState } from '../data/defaults.js';
import { calculateQuote } from '../core/calculator.js';

const STORAGE_KEY = 'contagest_ve_enterprise_v7_state';
const listeners = new Set();
const clone = (value) => JSON.parse(JSON.stringify(value));
const LOGIN_RENDER_KEYS = new Set(['route', 'pendingMfa', 'profile', 'activeLicense']);

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const output = Array.isArray(target) ? [...target] : { ...target };
  Object.entries(source).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) output[key] = deepMerge(output[key] || {}, value);
    else output[key] = value;
  });
  return output;
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
    state = normalize(deepMerge(state, partial));
    persist();
    if (shouldEmitLoginSet(previousRoute, partial)) emit();
  },
  update(mutator) {
    const previousRoute = state.route;
    const draft = clone(state);
    const result = mutator(draft) || draft;
    state = normalize(result);
    persist();
    // Background analytics uses Store.update(). While the unauthenticated login
    // is mounted it must not cause the application shell to replace #app and
    // destroy the browser's focused credential input. Login transitions use
    // Store.set({route/pendingMfa/...}) and still notify normally.
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
