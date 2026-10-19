import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem(key) { return memory.get(key) ?? null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); }
};
const { Store } = await import('../frontend/src/state/store.js');

test('clinical facts remain available in memory but never enter persisted/exported application state', () => {
  const sensitive = 'PRIVATE-CROSS-PATIENT-ALLERGY-2026';
  Store.set({healthVertical:{clinicalFacts:[{detail:{description:sensitive}}],selectedPatientId:'patient-1'}});
  assert.match(JSON.stringify(Store.get().healthVertical), new RegExp(sensitive));
  assert.doesNotMatch([...memory.values()].join('\n'), new RegExp(sensitive));
  assert.doesNotMatch(Store.export(), new RegExp(sensitive));
});

test('legacy/imported clinical caches are not rehydrated or reexported', () => {
  const sensitive = 'PRIVATE-LEGACY-ENCOUNTER-2026';
  Store.import({healthVertical:{encounters:[{subjective:sensitive}]},route:'salud'});
  assert.doesNotMatch(Store.export(), new RegExp(sensitive));
  assert.doesNotMatch([...memory.values()].join('\n'), new RegExp(sensitive));
  Store.switchSessionScope(null);
  assert.doesNotMatch(JSON.stringify(Store.get()), new RegExp(sensitive));
});
