import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { __test__, appendHipicoLedgerEntry } from './hipico-money-ledger.store.js';

const source=readFileSync(new URL('./hipico-money-ledger.store.ts',import.meta.url),'utf8');
const existing={
  id:'entry-1',amountMinor:'10000',participantCode:'zedan',currency:'VES',entryType:'bet',originalEntryId:null,
  raceKey:'racectx-1',settlementOfKey:null,sourceEventId:'event-1',sourceMessageKey:'message-1'
};
const command={
  participantCode:'zedan',currency:'VES',entryType:'bet' as const,amountMinor:10000n,originalEntryId:null,
  raceKey:'racectx-1',settlementOfKey:null,sourceEventId:'event-1',sourceMessageKey:'message-1'
};

test('financial idempotency accepts only the exact same ledger command',()=>{
  assert.doesNotThrow(()=>__test__.assertIdempotentReplay(existing,command));
  for(const changed of [
    {...command,amountMinor:90000n},
    {...command,participantCode:'otro'},
    {...command,currency:'USD'},
    {...command,raceKey:'racectx-2'},
    {...command,sourceMessageKey:'message-2'}
  ]){
    assert.throws(()=>__test__.assertIdempotentReplay(existing,changed as any),(error:any)=>error?.code==='HIPICO_LEDGER_IDEMPOTENCY_MISMATCH');
  }
});

test('same financial idempotency key is serialized before duplicate lookup',()=>{
  assert.equal(__test__.idempotencyLockKey('owner','group','request'),'["owner","group","request"]');
  const lock=source.indexOf('pg_advisory_xact_lock(hashtextextended');
  const duplicate=source.indexOf('const duplicate=await tx.$queryRaw<ExistingEntry[]>');
  assert.ok(lock>=0&&duplicate>lock);
  assert.match(source,/idempotencyLockKey\(ownerId,groupKey,idempotencyKey\)/);
});

test('non-reversal ledger entries never silently default a missing amount to zero',async()=>{
  await assert.rejects(
    appendHipicoLedgerEntry({ownerId:'00000000-0000-0000-0000-000000000001',groupKey:'g1',participantCode:'zedan',currency:'VES',entryType:'bet',idempotencyKey:'k1'}),
    /HIPICO_LEDGER_AMOUNT_REQUIRED/
  );
});

test('ledger currency is a canonical three-letter code before persistence',async()=>{
  await assert.rejects(
    appendHipicoLedgerEntry({ownerId:'00000000-0000-0000-0000-000000000001',groupKey:'g1',participantCode:'zedan',currency:'bolivares',entryType:'bet',amountMinor:'100',idempotencyKey:'k2'}),
    /HIPICO_LEDGER_CURRENCY_INVALID/
  );
});
