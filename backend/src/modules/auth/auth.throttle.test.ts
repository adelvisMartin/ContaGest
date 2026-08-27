import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateLoginThrottle,
  loadLoginThrottlePolicy,
  normalizeLoginIdentity,
  type LoginThrottlePolicy
} from './auth.throttle.js';

const policy: LoginThrottlePolicy = {
  failureLimit: 3,
  observationWindowMs: 1_000,
  lockDurationMs: 1_000,
  retentionMs: 90 * 24 * 60 * 60 * 1_000
};

function attempt(id:string,success:boolean,at:number){return{id,success,createdAt:new Date(at)};}

test('normalizes tenant RIF/email so casing and surrounding whitespace cannot split counters',()=>{
  const left=normalizeLoginIdentity({tenantRif:' j-12345678-9 ',email:' User@Example.COM ',ipAddress:' 10.1.2.3 '});
  const right=normalizeLoginIdentity({tenantRif:'J-12345678-9',email:'user@example.com',ipAddress:'10.1.2.3'});
  assert.deepEqual(left,right);
});

test('policy is configurable, bounded and keeps production-safe defaults',()=>{
  const defaults=loadLoginThrottlePolicy({NODE_ENV:'production'});
  assert.equal(defaults.failureLimit,5);
  assert.equal(defaults.observationWindowMs,15*60*1000);
  assert.equal(defaults.lockDurationMs,15*60*1000);
  assert.equal(defaults.retentionMs,90*24*60*60*1000);

  const configured=loadLoginThrottlePolicy({
    NODE_ENV:'test',
    AUTH_LOGIN_FAILURE_LIMIT:'7',
    AUTH_LOGIN_OBSERVATION_WINDOW_SECONDS:'2',
    AUTH_LOGIN_LOCK_SECONDS:'4',
    AUTH_LOGIN_ATTEMPT_RETENTION_DAYS:'30'
  });
  assert.deepEqual(configured,{
    failureLimit:7,
    observationWindowMs:2_000,
    lockDurationMs:4_000,
    retentionMs:30*24*60*60*1000
  });
});

test('activates a bounded temporary lock exactly at the threshold',()=>{
  const attempts=[attempt('f1',false,100),attempt('f2',false,200),attempt('f3',false,300)];
  const state=evaluateLoginThrottle(attempts,new Date(400),policy);
  assert.equal(state.locked,true);
  assert.equal(state.thresholdAttemptId,'f3');
  assert.equal(state.lockedUntil?.getTime(),1_300);
});

test('concurrent in-flight failures do not extend an already activated lock',()=>{
  const attempts=[
    attempt('f1',false,100),attempt('f2',false,200),attempt('f3',false,300),
    attempt('concurrent-1',false,310),attempt('concurrent-2',false,320)
  ];
  const state=evaluateLoginThrottle(attempts,new Date(500),policy);
  assert.equal(state.locked,true);
  assert.equal(state.thresholdAttemptId,'f3');
  assert.equal(state.lockedUntil?.getTime(),1_300);
});

test('lock expires automatically and the first post-expiry failure starts a fresh window',()=>{
  const locked=[attempt('f1',false,100),attempt('f2',false,200),attempt('f3',false,300)];
  const expired=evaluateLoginThrottle(locked,new Date(1_301),policy);
  assert.equal(expired.locked,false);
  assert.equal(expired.expiredLockUntil?.getTime(),1_300);
  assert.equal(expired.shouldEmitExpired,true);

  const restarted=evaluateLoginThrottle([...locked,attempt('new-f1',false,1_400)],new Date(1_401),policy);
  assert.equal(restarted.locked,false);
  assert.equal(restarted.failureCount,1);
  assert.equal(restarted.shouldEmitExpired,false);
});

test('successful login resets defensive state without deleting historical attempts',()=>{
  const attempts=[
    attempt('f1',false,100),attempt('f2',false,200),
    attempt('success',true,250),
    attempt('new-f1',false,300),attempt('new-f2',false,400)
  ];
  const state=evaluateLoginThrottle(attempts,new Date(450),policy);
  assert.equal(state.locked,false);
  assert.equal(state.failureCount,2);
  assert.equal(state.thresholdAttemptId,null);
});

test('failures outside the observation window do not accumulate into a lock',()=>{
  const attempts=[attempt('f1',false,100),attempt('f2',false,1_200),attempt('f3',false,2_300)];
  const state=evaluateLoginThrottle(attempts,new Date(2_301),policy);
  assert.equal(state.locked,false);
  assert.equal(state.failureCount,1);
});
