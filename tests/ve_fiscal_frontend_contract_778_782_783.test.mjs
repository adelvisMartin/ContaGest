import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = name => readFileSync(new URL('../frontend/src/' + name, import.meta.url), 'utf8');
const api = source('services/backendApi.js');
const fiscal = source('services/fiscalService.js');
const page = source('pages/TaxesPage.jsx');

test('#778/#782 financial HTTP client protects every fiscal write with idempotency', () => {
  const policy = api.split('function needsFinancialIdempotency(')[1]?.split('function createFinancialIdempotencyKey(')[0];
  assert.ok(policy);
  for (const route of ['/fiscal/close-period', '/fiscal/reopen-period',
    '/fiscal/documents', '/fiscal/documents/issue']) {
    assert.ok(policy.includes(route), route);
  }
  assert.ok(policy.includes('compliance') && policy.includes('declarations'));
  assert.match(api, /acquireFinancialIdempotencyKey/);
  assert.match(api, /headers:\{ \.\.\.headers/);
});

test('#782 external fiscal documents must never render as verified or successful', () => {
  assert.match(page, /EXTERNO · SIN VERIFICAR/);
  assert.match(page, /tone="warning"/);
  assert.match(page, /Documento externo registrado como NO VERIFICADO/);
  assert.doesNotMatch(page, /label=\{String\(doc\.status\|\|'issued'\)\.toUpperCase\(\)\} tone="success"/);
});

test('#783 period readiness must not claim that recording is SENIAT filing', () => {
  assert.match(fiscal, /complianceReadiness\(period\)/);
  assert.match(fiscal, /transitionDeclaration\(id,data\)/);
  assert.match(page, /Centro de cumplimiento fiscal/);
  assert.match(page, /NO APTO PARA DECLARAR O PAGAR/);
  assert.match(page, /SIN VERIFICACIÓN OFICIAL/);
  assert.match(page, /NO CERTIFICADA/);
});
