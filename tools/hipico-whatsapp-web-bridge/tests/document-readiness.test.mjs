import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRuntimeReadiness } from '../src/health-state.mjs';

const base={runtimeMode:'production',backendState:'online',activeSourceTitle:'CLUB HIPICO TRIPLE CROWN',sourceMatches:['CLUB HIPICO TRIPLE CROWN']};

test('production readiness degrades while PDFs remain pending',()=>{
  const readiness=assessRuntimeReadiness({...base,documentSpool:2});
  assert.equal(readiness.ready,false);
  assert.ok(readiness.reasons.includes('DOCUMENT_SPOOL_PENDING'));
});

test('production readiness blocks when a PDF is quarantined',()=>{
  const readiness=assessRuntimeReadiness({...base,documentQuarantine:1});
  assert.equal(readiness.ready,false);
  assert.equal(readiness.state,'blocked');
  assert.ok(readiness.reasons.includes('DOCUMENT_QUARANTINE_PRESENT'));
});
