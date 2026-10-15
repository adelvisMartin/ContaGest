import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');
const middleware=read('backend/src/shared/middleware/error.ts');
const contract=read('backend/src/shared/observability/contract.ts');
const redaction=read('backend/src/shared/observability/redaction.ts');
const http=read('backend/src/shared/http.ts');

test('59/75 API validation delegates Zod to the canonical v2 normalizer and returns 422 with redacted issues',()=>{
  assert.match(middleware,/normalizeOperationalError\(error\)/);
  assert.match(middleware,/buildErrorEnvelope\(normalized, context\)/);
  assert.match(middleware,/return res\.status\(normalized\.status\)\.json\(buildErrorEnvelope\(normalized, context\)\)/);
  assert.match(contract,/error\?\.name === 'ZodError' && Array\.isArray\(error\?\.issues\)/);
  assert.match(contract,/const status = dependency \? 503 : validation \? 422 : explicitStatus \|\| 500/);
  assert.match(contract,/if \(validation\) return 'La solicitud contiene datos inválidos\.'/);
  assert.match(contract,/redactTelemetryValue\(validation \? source\.issues : source\?\.details\)/);
  assert.match(redaction,/SENSITIVE_FIELD\.test\(key\) \? REDACTION_CENSOR : visit\(nested, depth \+ 1\)/);
  assert.match(contract,/errorEnvelopeVersion:\s*2/);
  assert.doesNotMatch(middleware,/res\.status\(422\)\.json\(error\)|error\.issues\s*\)/,
    'the middleware must never expose raw Zod issues');
});

test('59/75 error handler honors HttpError, dependency 503, safe Problem Details and pseudonymized telemetry',()=>{
  assert.match(http,/export class HttpError extends Error/);
  assert.match(http,/this\.status = status/);
  assert.match(contract,/const explicitStatus = boundedStatus\(source\?\.status\)/);
  assert.match(contract,/const status = dependency \? 503 : validation \? 422 : explicitStatus \|\| 500/);
  assert.match(contract,/const DEPENDENCY_CODES = new Set\(\[/);
  for(const code of ['P1001','P1002','ECONNREFUSED','ETIMEDOUT'])
    assert.ok(contract.includes(`'${code}'`),`missing dependency code ${code}`);
  assert.match(contract,/const code = dependency \? 'DEPENDENCY_UNAVAILABLE'/);
  assert.match(contract,/const details = status < 500/);
  assert.match(contract,/return \{[\s\S]*?ok: false as const,[\s\S]*?type: problemType\(error\.code\)/);
  for(const field of ['title: problemTitle(error.status)','status: error.status','detail: error.safeMessage','correlationId'])
    assert.ok(contract.includes(field),`missing v2 public field ${field}`);
  assert.match(middleware,/pseudonymizeIdentifier\('tenant', tenantId\)/);
  assert.match(middleware,/pseudonymizeIdentifier\('user', userId\)/);
  assert.match(middleware,/structuredErrorFields\(normalized\)/);
  assert.doesNotMatch(middleware,/console\.(?:log|error)\(|(?:res|response)\.json\(error\)/);
});
