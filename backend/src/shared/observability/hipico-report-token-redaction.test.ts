import test from 'node:test';
import assert from 'node:assert/strict';
import { redactTelemetryValue, sanitizeLogValue } from './redaction.js';
import { normalizeOperationalError, safePersistedError } from './contract.js';

const rawToken = 'A'.repeat(43);
const base = '/api/v1/hipico/report-shares/public';
const url = base + '?t=' + rawToken + '&date=2026-10-15&view=consolidated';

test('redacts ?t= bearer capability in full URL but preserves useful non-sensitive route/query', () => {
  const redacted=redactTelemetryValue('GET https://hipico.test' + url);
  assert.equal(redacted,
    'GET https://hipico.test' + base + '?t=[REDACTED]&date=2026-10-15&view=consolidated');
  assert.ok(!String(redacted).includes(rawToken));
});

test('redacts encoded and uppercase t key as a query parameter', () => {
  for (const query of ['?t=', '?T=', '?%74=', '?%54=', '?view=consolidated&t=']) {
    const payload='report ' + base + query + rawToken;
    const text=String(redactTelemetryValue(payload));
    assert.doesNotMatch(text, new RegExp(rawToken));
    assert.match(text, /\[REDACTED\]/);
  }
});

test('redacts exact standalone t=<43-char-token> and t:<token> copied from query diagnostics', () => {
  for (const message of ['invalid t='+rawToken, 't: '+rawToken]) {
    const redacted=String(redactTelemetryValue(message));
    assert.ok(redacted.includes('t=[REDACTED]'));
    assert.ok(!redacted.includes(rawToken));
  }
  assert.equal(redactTelemetryValue('t=12 &view=consolidated'),
    't=12 &view=consolidated', 'unrelated short t argument is not a 43-char capability');
});

test('redacts nested parsed query objects without destroying unrelated fields', () => {
  const input = { query: { t: rawToken, T: rawToken, view: 'consolidated', date: '2026-10-15' },
    request: { headers: { authorization: 'Bearer '+rawToken } },
    items: [{t:rawToken},{ trace:'ok' }] };
  const result = redactTelemetryValue(input) as any;
  assert.equal(result.query.t,'[REDACTED]');
  assert.equal(result.query.T,'[REDACTED]');
  assert.equal(result.query.date,'2026-10-15');
  assert.equal(result.query.view,'consolidated');
  assert.equal(result.request.headers.authorization,'[REDACTED]');
  assert.equal(result.items[0].t,'[REDACTED]');
  assert.ok(!JSON.stringify(result).includes(rawToken));
});

test('redacts capability from client-safe and persisted operational error text', () => {
  const error = Object.assign(new Error('Invalid report ' + url), {status:400,code:'BAD_REQUEST'});
  const normalized=normalizeOperationalError(error);
  assert.equal(normalized.status,400);
  assert.ok(normalized.safeMessage.includes('t=[REDACTED]'));
  assert.ok(!JSON.stringify(normalized).includes(rawToken));
  const persisted=safePersistedError(error);
  assert.ok(!persisted.includes(rawToken));
  assert.ok(persisted.includes('[REDACTED]'));
});

test('preserves normal identifier t in unrelated nested telemetry while masking its value', () => {
  const output=redactTelemetryValue({ t: rawToken, view:'group', safe: true }) as any;
  assert.equal(output.t,'[REDACTED]');
  assert.equal(output.view,'group');
  assert.equal(output.safe,true);
  assert.equal(sanitizeLogValue(base,240),base);
});

test('URL redaction must not alter signed-token formats that already worked', () => {
  for (const key of ['token','access_token','signature','x-amz-credential','api_key']) {
    const text=String(redactTelemetryValue('/resource?'+key+'='+rawToken+'&view=1'));
    assert.match(text, /\[REDACTED\]/);
    assert.ok(!text.includes(rawToken));
  }
});
