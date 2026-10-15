import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAsyncJobFailure, makeClassifiedAsyncJobFailure } from '../backend/src/modules/jobs/async-failure-policy.ts';
const classify = (error, safe) => classifyAsyncJobFailure(error, {idempotentRetryVerified: safe});

test('only reviewed transient categories can be retryable with verified safe effects', () => {
  for (const category of ['TEMPORARY_PROVIDER_OUTAGE','PROVIDER_RATE_LIMIT','TEMPORARY_TRANSPORT']) {
    const decision = classify(makeClassifiedAsyncJobFailure(category), true);
    assert.equal(decision.retryable, true);
    assert.match(decision.safeErrorCode, /^JOB_[A-Z_]+$/);
  }
});

test('unverified side effects must never be retried after an uncertain external result', () => {
  for (const category of ['TEMPORARY_PROVIDER_OUTAGE','PROVIDER_RATE_LIMIT','TEMPORARY_TRANSPORT']) {
    assert.deepEqual(classify(makeClassifiedAsyncJobFailure(category), false), {
      safeErrorCode: 'JOB_RETRY_UNSAFE_EFFECT', retryable: false,
    });
  }
});

test('permanent errors and ambiguous effect results are dead-letter categories', () => {
  for (const category of ['PERMANENT_PROVIDER_REJECTION','HANDLER_VERSION_UNAVAILABLE','INVALID_HANDLER_PAYLOAD','SIDE_EFFECT_OUTCOME_UNKNOWN']) {
    const decision = classify(makeClassifiedAsyncJobFailure(category), true);
    assert.equal(decision.retryable, false);
  }
});

test('raw provider error or arbitrary status code never creates retry authority', () => {
  for (const err of [new Error('password=secret'),{code:'PROVIDER_RATE_LIMIT',message:'token=secret'},429,undefined,null,'TEMPORARY_TRANSPORT']) {
    assert.deepEqual(classify(err, true), {safeErrorCode:'JOB_UNCLASSIFIED_FAILURE',retryable:false});
  }
});

test('malicious accessors in provider error are not executed', () => {
  let count=0;
  const untrusted = { get code() { count++; throw Error('leak'); }, get message() { count++; return 'raw'; } };
  assert.deepEqual(classify(untrusted,true),{safeErrorCode:'JOB_UNCLASSIFIED_FAILURE',retryable:false});
  assert.equal(count,0);
});

test('caller cannot construct or forge an approved classified failure', () => {
  for (const category of ['__proto__','constructor','bad','TEMPORARY_PROVIDER_OUTAGE ',null,42,Symbol('bad')]) {
    assert.throws(()=>makeClassifiedAsyncJobFailure(category),/JOB_FAILURE_CATEGORY_INVALID/);
  }
  const fake = {name:'ASYNC_JOB_FAILURE',message:'ASYNC_JOB_FAILURE'};
  assert.equal(classify(fake,true).retryable,false);
});

test('missing or nonboolean retry safety is a hard error', () => {
  const error = makeClassifiedAsyncJobFailure('TEMPORARY_TRANSPORT');
  for(const options of [undefined, {}, {idempotentRetryVerified:'true'}, {idempotentRetryVerified:1}]) {
    assert.throws(()=>classifyAsyncJobFailure(error,options),/JOB_RETRY_SAFETY_REQUIRED/);
  }
});

test('decisions expose fixed safe fields only; no raw message or PII', () => {
  const result=classify(makeClassifiedAsyncJobFailure('PERMANENT_PROVIDER_REJECTION'),true);
  assert.deepEqual(Object.keys(result).sort(),['retryable','safeErrorCode']);
  assert.equal(JSON.stringify(result).includes('secret'),false);
  assert.ok(Object.isFrozen(result));
});

test('classification is stable on repeated checks without mutating the error', () => {
  const error=makeClassifiedAsyncJobFailure('PROVIDER_RATE_LIMIT');
  assert.deepEqual(classify(error,true),classify(error,true));
  assert.notDeepEqual(classify(error,true),classify(error,false));
});
