import { createDefaultState } from '../data/defaults.js';
import { calculateQuote } from '../core/calculator.js';

const STORAGE_KEY = 'contagest_ve_enterprise_v7_state';
const listeners = new Set();
const clone = (value) => JSON.parse(JSON.stringify(value));

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

export const Store = {
  get() { return clone(state); },
  set(partial) {
    state = normalize(deepMerge(state, partial));
    persist();
    emit();
  },
  update(mutator) {
    const draft = clone(state);
    const result = mutator(draft) || draft;
    state = normalize(result);
    persist();
    emit();
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
