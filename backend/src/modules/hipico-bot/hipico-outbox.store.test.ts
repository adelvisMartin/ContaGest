import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sameCanonicalOutboundIntent } from './hipico-outbox.store.js';

const source=readFileSync(new URL('./hipico-outbox.store.ts',import.meta.url),'utf8');

const base={
  ownerId:'11111111-1111-4111-8111-111111111111',
  groupKey:'club-hipico-source',
  destination:'584121234567',
  replyType:'operational',
  provider:'meta_cloud',
  payloadDigest:'a'.repeat(64)
};

test('canonical outbox store: idempotent replay must keep identical semantic intent',()=>{
  assert.equal(sameCanonicalOutboundIntent(base,{...base}),true);
  assert.equal(sameCanonicalOutboundIntent(base,{...base,destination:'584141112233'}),false);
  assert.equal(sameCanonicalOutboundIntent(base,{...base,payloadDigest:'b'.repeat(64)}),false);
  assert.equal(sameCanonicalOutboundIntent(base,{...base,groupKey:'other-group'}),false);
});

test('canonical outbox store: claim uses PostgreSQL row locking and only queued/retry states',()=>{
  assert.match(source,/FOR UPDATE SKIP LOCKED/i);
  assert.match(source,/status\s+IN\s*\(\s*'queued'\s*,\s*'retry'\s*\)/i);
  assert.match(source,/lease_token/i);
  assert.match(source,/leased_until/i);
  assert.match(source,/cooldown/i);
  assert.match(source,/status='sending'/i);
});

test('canonical outbox store: generic worker cannot claim approval-required rows',()=>{
  assert.match(source,/allowApprovalRequired/);
  assert.match(source,/payload\s*->>\s*'approvalRequired'/i);
  assert.match(source,/COALESCE\([^\n]+approvalRequired[^\n]+false\)/i);
});

test('canonical outbox store: production authority never writes legacy HipicoBotOutbox',()=>{
  assert.doesNotMatch(source,/HipicoBotOutbox/);
  assert.match(source,/public\.hipico_outbox/);
  assert.match(source,/public\.hipico_outbox_receipts/);
});

test('canonical outbox store: reconciliation is excluded from automatic claim states',()=>{
  const claimFragment=source.slice(source.indexOf('FOR UPDATE SKIP LOCKED')-3000,source.indexOf('FOR UPDATE SKIP LOCKED')+200);
  assert.doesNotMatch(claimFragment,/reconciliation_required/);
});
