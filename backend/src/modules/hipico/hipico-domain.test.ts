import test from 'node:test';
import assert from 'node:assert/strict';
import { componentState, hipicoError } from './hipico-domain.js';

void test('canonical error envelope is bounded and stable', () => {
  assert.deepEqual(hipicoError({
    code: 'RACE_CONTEXT_AMBIGUOUS',
    message: 'La carrera no se pudo resolver.',
    requestId: 'req-12345678'
  }), {
    ok: false,
    code: 'RACE_CONTEXT_AMBIGUOUS',
    message: 'La carrera no se pudo resolver.',
    requestId: 'req-12345678',
    retryable: false
  });
});

void test('component state accepts explicit readiness values only', () => {
  assert.deepEqual(componentState('not_configured', 'DOCUMENT_ENGINE_NOT_INSTALLED'), {
    state: 'not_configured',
    reason: 'DOCUMENT_ENGINE_NOT_INSTALLED'
  });
});
