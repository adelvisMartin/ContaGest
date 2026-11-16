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

// #637 characterization: period-close transport cannot write money-changing state.
test('#637 accounting period close is a tenant-scoped transactional domain command',()=>{
  const routes=readFileSync(new URL('../backend/src/modules/accounting/accounting.routes.ts',import.meta.url),'utf8');
  const endpoint=routes.split("router.post('/closing-periods/:id/close'")[1]?.split('\n}));')[0];
  assert.ok(endpoint);
  assert.match(endpoint,/requirePermission\('accounting\.post'\)/);
  assert.match(endpoint,/await closeAccountingPeriod\(/);
  assert.doesNotMatch(endpoint,/prisma\.closingPeriod|writeAudit\(/);
  const source=readFileSync(new URL('../backend/src/modules/accounting/accounting.service.ts',import.meta.url),'utf8');
  const body=source.split('export async function closeAccountingPeriod(')[1]?.split('function normalizeLedgerLines')[0];
  assert.ok(body);
  // A tenant-scoped read discovers the period used for the shared advisory lock;
  // a second tenant-scoped read after FOR UPDATE is the mutation authority.
  const gates=['requirePostingActor(', 'prisma.$transaction(async (tx)',
    'const candidate = await tx.closingPeriod.findFirst({',
    'await lockAccountingPeriodMutation(input.tenantId, candidate.period, tx);',
    'FOR UPDATE',
    'const existing = await tx.closingPeriod.findFirst({',
    "existing.status === 'closed'",
    'tx.closingPeriod.updateMany({', 'updated.count !== 1',
    'tx.auditLog.create({'];
  let prev=-1;
  for(const gate of gates){const next=body.indexOf(gate);assert.ok(next>prev,gate);prev=next;}
  assert.match(body,/WHERE "id" = \$\{input\.periodId\} AND "tenantId" = \$\{input\.tenantId\}/);
  assert.match(body,/status: 'open'/);
});

test('#637 manual DRAFT deletion requires atomic audit and cannot drop protected history',()=>{
  const service=readFileSync(new URL('../backend/src/modules/accounting/accounting.service.ts',import.meta.url),'utf8');
  const routes=readFileSync(new URL('../backend/src/modules/accounting/accounting.routes.ts',import.meta.url),'utf8');
  const migration=readFileSync(new URL('../backend/prisma/migrations/20261116170000_issue_637_manual_draft_and_reversal_integrity/migration.sql',import.meta.url),'utf8');
  const command=service.split('export async function deleteDraftLedgerEntry(')[1]?.split('export async function postLedgerEntry(')[0];
  assert.ok(command,'Manual draft deletion command must exist');
  const steps=['requirePostingActor(', 'prisma.$transaction(async (tx)', 'lockScopedLedgerEntry(tx,',
    "assertLedgerActionAllowed(entry, 'delete')", "entry.source !== 'manual'",
    'assertPeriodOpen(', 'tx.auditLog.create({', 'tx.ledgerEntry.delete({'];
  let previous=-1;
  for (const step of steps) {
    const position=command.indexOf(step);
    assert.ok(position>previous,'Atomic draft delete step missing or out of order: '+step);
    previous=position;
  }
  assert.match(routes,/deleteDraftLedgerEntry\(\{[\s\S]*?deletedBy: ctx\.userId/);
  assert.doesNotMatch(routes.split("router.delete('/entries/:id'")[1]?.split("\n}));")[0]||'',/writeAudit\(/);
  assert.match(migration,/IF TG_TABLE_NAME = 'LedgerEntry'/);
  assert.match(migration,/OLD\."posted" IS FALSE/);
  assert.match(migration,/OLD\."source" = 'manual'/);
  assert.match(migration,/OLD\."sourceId" IS NULL/);
  assert.match(migration,/a\."action" = 'ledger\.entry\.draft-deleted'/);
  assert.match(migration,/a\."userId" IS NOT NULL/);
  assert.match(migration,/data_lifecycle_assert_not_held/);
  assert.match(migration,/OLD\."tenantId"::uuid/, 'UUID-typed legal hold must receive explicit cast from ledger tenant TEXT');
  assert.match(migration,/p\."tenantId" = OLD\."tenantId"::uuid/, 'Retention policy UUID comparison must use explicit cast');
  assert.match(migration,/LEDGER_DRAFT_DELETE_AUDIT_REQUIRED/);
  assert.match(migration,/generic delete denied for protected lifecycle entity/);
  assert.match(migration,/retention policy denies purge for protected lifecycle entity/);
});

test('#637 reversal into a later OPEN period keeps exact counter-entry controls',()=>{
  const migration=readFileSync(new URL('../backend/prisma/migrations/20261116170000_issue_637_manual_draft_and_reversal_integrity/migration.sql',import.meta.url),'utf8');
  const functionSql=migration.split('CREATE OR REPLACE FUNCTION public.guard_ledger_reversal_compensation()')[1];
  assert.ok(functionSql,'The protected reverse trigger must remain installed');
  assert.match(functionSql,/original_tenant IS DISTINCT FROM NEW\."tenantId"/);
  assert.match(functionSql,/original_posted IS DISTINCT FROM TRUE/);
  assert.match(functionSql,/FULL OUTER JOIN reversal/);
  assert.match(functionSql,/COALESCE\(r\.debit, 0\) <> COALESCE\(o\.credit, 0\)/);
  assert.match(functionSql,/COALESCE\(r\.credit, 0\) <> COALESCE\(o\.debit, 0\)/);
  assert.doesNotMatch(functionSql,/original_period IS DISTINCT FROM NEW\."fiscalPeriod"/);
  assert.match(migration,/LedgerEntry_period_insert_gate/);
});
