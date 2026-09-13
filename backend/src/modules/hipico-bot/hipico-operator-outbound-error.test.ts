import assert from 'node:assert/strict';
import test from 'node:test';
import { __test__ } from './hipico-operator.routes.js';

test('operator outbound response never asks clients to retry a durable failed provider rejection',()=>{
  const result=__test__.outboundErrorContract({code:'HIPICO_CLOUD_HTTP_ERROR',status:429});
  assert.equal(result.status,502);
  assert.equal(result.body.retryable,false);
  assert.equal(result.body.error,'provider_http_rejection_review_required');
});

test('operator outbound ambiguity remains manual reconciliation and transport misconfiguration is distinguishable',()=>{
  const ambiguous=__test__.outboundErrorContract({code:'HIPICO_CLOUD_DELIVERY_AMBIGUOUS'});
  assert.equal(ambiguous.status,202);
  assert.equal(ambiguous.body.retryable,false);
  assert.equal(ambiguous.body.error,'reconciliation_required');

  const config=__test__.outboundErrorContract({code:'HIPICO_CLOUD_TRANSPORT_NOT_CONFIGURED'});
  assert.equal(config.status,503);
  assert.equal(config.body.retryable,true);
  assert.equal(config.body.error,'sender_not_configured');
});
