import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { assertManualPostingAccounts } from '../backend/src/modules/accounting/manual-posting-policy.ts';
const tenant = 'tenant-A';
const accounts = Object.freeze([
  {tenantId:tenant, code:'1.01', active:true, allowPosting:true},
  {tenantId:tenant, code:'4.01', active:true, allowPosting:true}
]);
const lines = Object.freeze([{accountCode:'1.01'}, {accountCode:'4.01'}]);
const go = (a=accounts,l=lines,t=tenant)=>assertManualPostingAccounts(t,l,a);
const denied = fn=>assert.throws(fn,{message:'MANUAL_POSTING_ACCOUNT_NOT_AUTHORIZED'});
test('#637 accepts active postable tenant chart accounts',()=>{assert.doesNotThrow(()=>go());assert.equal(go(),undefined);});
test('#637 rejects cross-tenant code even when code exists in tenant A',()=>{denied(()=>go(accounts,lines,'tenant-B'));denied(()=>go([...accounts,{...accounts[0],tenantId:'tenant-B',code:'other'}]));});
test('#637 rejects unknown account, invalid code and duplicates',()=>{denied(()=>go(accounts,[lines[0],{accountCode:'missing'}]));denied(()=>go(accounts,[lines[0],{accountCode:''}]));denied(()=>go([...accounts,accounts[0]]));});
test('#637 rejects disabled and grouping accounts',()=>{denied(()=>go([{...accounts[0],active:false},accounts[1]]));denied(()=>go([accounts[0],{...accounts[1],allowPosting:false}]));});
test('#637 rejects too few, too many, malformed lines and tenant identity',()=>{denied(()=>go(accounts,[]));denied(()=>go(accounts,[lines[0]]));denied(()=>go(accounts,Array.from({length:201},()=>lines[0])));denied(()=>go(accounts,[lines[0],null]));denied(()=>go(accounts,lines,''));});
test('#637 does not mutate inputs or impose fixed codes',()=>{const snapshot=JSON.stringify([accounts,lines]);go();assert.equal(JSON.stringify([accounts,lines]),snapshot);assert.doesNotThrow(()=>go(accounts,[{accountCode:'4.01'},{accountCode:'1.01'}]));});

test('#637 reversal requires the row lock and re-reads tenant-scoped entry within one transaction',()=>{
  const source=readFileSync(new URL('../backend/src/modules/accounting/accounting.service.ts',import.meta.url),'utf8');
  const fn=source.split('export async function reverseLedgerEntry(')[1]?.split('type PostingAccounts =')[0];
  assert.ok(fn,'reversal service must exist');
  const tx=fn.indexOf('return await prisma.$transaction(async (tx) => {');
  assert.ok(tx>0,'reversal must be transactional');
  const prefix=fn.slice(0,tx),body=fn.slice(tx);
  assert.doesNotMatch(prefix,/prisma\.ledgerEntry\.findFirst|assertPeriodOpen\(/,'stale reads and period checks outside the transaction are forbidden');
  const steps=[
    'await lockScopedLedgerEntry(tx, input.tenantId, input.entryId);',
    'await tx.ledgerEntry.findFirst({',
    "assertLedgerActionAllowed(original, 'reverse');",
    'await assertPeriodOpen(input.tenantId, input.fiscalPeriod, tx);',
    'const lines = inverseLedgerLines(original.lines);',
    'await tx.ledgerEntry.create({',
    'await tx.ledgerEntry.update({',
    'await tx.auditLog.create({'
  ];
  let previous=-1;
  for(const step of steps){
    const pos=body.indexOf(step);
    assert.ok(pos>previous,step+' must occur in order after transaction begins');
    previous=pos;
  }
  assert.match(body,/where: \{ id: input.entryId, tenantId: input.tenantId \}/,'tenant predicate must survive');
  assert.match(fn,/error\?\.code === 'P2002'/,'concurrent reversal must remain a 409');
  assert.match(body,/posted: true/,'reversal remains posted only after the draft is created');
});

test('#637 concurrent reversal cannot read original outside the locked transaction',()=>{
  const source=readFileSync(new URL('../backend/src/modules/accounting/accounting.service.ts',import.meta.url),'utf8');
  const fn=source.split('export async function reverseLedgerEntry(')[1]?.split('type PostingAccounts =')[0];
  const tx=fn.indexOf('return await prisma.$transaction(async (tx) => {');
  assert.ok(tx>0);
  const outside=fn.slice(0,tx),inside=fn.slice(tx);
  assert.doesNotMatch(outside,/assertLedgerActionAllowed\(|inverseLedgerLines\(|ledgerEntry\.(?:findFirst|create|update)/);
  assert.match(inside,/await tx\.auditLog\.create\(/);
});
