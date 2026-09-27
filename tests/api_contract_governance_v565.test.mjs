import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>{
  assert.equal(fs.existsSync(path),true,`required #565 artifact missing: ${path}`);
  return fs.readFileSync(path,'utf8');
};

const policyPath='backend/src/contracts/api-contract-v1.json';

test('#565 makes API contracts machine-readable and drift-detectable',()=>{
  const generator=read('scripts/api-contract-v565.mjs');
  const policy=JSON.parse(read(policyPath));
  const app=read('backend/src/app.ts');
  const contractRoutes=read('backend/src/contracts/api-contract.routes.ts');
  const manifest=read('backend/src/modules/route-manifest.ts');

  for(const token of ['OpenAPI','route-manifest.ts','app.ts','router.get','router.post','drift','operationId']){
    assert.match(generator,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),`generator missing ${token}`);
  }
  assert.match(app,/apiContractRoutes/);
  assert.match(contractRoutes,/\/openapi\.json/);
  assert.match(contractRoutes,/\/contract\.json/);
  assert.match(manifest,/MODULE_ROUTE_MANIFEST/);
  assert.equal(policy.schemaVersion,1);
  assert.equal(policy.apiVersion,'v1');
  assert.equal(policy.errorEnvelope.required.includes('code'),true);
  assert.equal(policy.errorEnvelope.required.includes('requestId'),true);
  assert.equal(policy.errorEnvelope.required.includes('retryable'),true);
  assert.equal(policy.breakingChanges.requireVersionOrCompatibilityLayer,true);
  assert.equal(policy.deprecation.minimumNoticeDays>0,true);
  assert.equal(policy.pagination.defaultLimit>0,true);
  assert.equal(policy.pagination.maxLimit>=policy.pagination.defaultLimit,true);
});

test('#565 central error envelope is stable and never exposes stack',()=>{
  const http=read('backend/src/shared/http.ts');
  const errors=read('backend/src/shared/middleware/error.ts');
  for(const token of ['code','message','details','requestId','retryable']) assert.match(errors,new RegExp(token,'i'),`error middleware missing ${token}`);
  assert.doesNotMatch(errors,/payload\.stack|stack\s*:/,'HTTP errors must never serialize stack');
  assert.doesNotMatch(errors,/DATABASE_URL|pooler\.supabase|connection_limit/,'HTTP error copy must not disclose database topology/configuration');
  assert.match(http,/code\??:/);
  assert.match(http,/retryable\??:/);
});

test('#565 documents idempotency, decimals/dates/IDs, deprecation and canonical Hípico boundary',()=>{
  const policy=JSON.parse(read(policyPath));
  const adr=read('docs/ADR_API_CONTRACT_GOVERNANCE_V565.md');
  const hipico=read('backend/src/modules/hipico-bot/hipico-webhook.routes.ts');

  assert.equal(policy.idempotency.requiredForBusinessMutations,true);
  assert.equal(policy.representations.decimal,'string');
  assert.equal(policy.representations.dateTime,'RFC3339');
  assert.equal(policy.representations.id,'opaque-string');
  assert.equal(policy.hipico.canonicalPrefix,'/api/v1/hipico');
  assert.match(adr,/compatibility layer/i);
  assert.match(adr,/Sunset/i);
  assert.match(adr,/Deprecation/i);
  assert.match(adr,/legacy/i);
  assert.match(hipico,/webhookSignatureValid/);
  assert.match(hipico,/assertPersistedWebhookReplay/);
  assert.match(hipico,/retryable/);
});
