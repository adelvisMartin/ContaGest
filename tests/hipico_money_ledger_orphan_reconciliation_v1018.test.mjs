import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../backend/src/modules/hipico-bot/hipico-money-ledger.store.ts',import.meta.url),'utf8');
const segment = source.slice(source.indexOf('export async function reconcileHipicoLedger('),
  source.indexOf('export const __test__='));

function reconcileFixture(accounts, journal, ownerId, groupKey) {
  // Independent reference semantics for the new full-outer reconciliation
  // (NOT a substitute for testing the actual PostgreSQL query).
  const key = (row) => JSON.stringify([row.participantCode,row.currency]);
  const scopedAccounts = new Map(accounts.filter(row =>
    row.ownerId === ownerId && row.groupKey === groupKey).map(row => [key(row), row]));
  const totals = new Map();
  for (const row of journal.filter(row => row.ownerId === ownerId && row.groupKey === groupKey)) {
    const id=key(row);
    totals.set(id,(totals.get(id)||0n) + BigInt(row.minor));
  }
  return [...new Set([...scopedAccounts.keys(),...totals.keys()])].sort().map(id => {
    const a=scopedAccounts.get(id),j=totals.get(id);
    const [participantCode,currency]=JSON.parse(id);
    return {participantCode,currency,balanceMinor:String(a?.minor??0n),
      sumMinor:String(j??0n),matches:Boolean(a) && BigInt(a.minor) === (j??0n),
      accountPresent:Boolean(a),ledgerPresent:j!==undefined};
  });
}

const account = (ownerId,groupKey,participantCode,currency,minor) =>
  ({ownerId,groupKey,participantCode,currency,minor});
const posting = (ownerId,groupKey,participantCode,currency,minor) =>
  ({ownerId,groupKey,participantCode,currency,minor});

test('canonical SQL reconciles both scoped account keys and orphan ledger keys',()=>{
  assert.match(segment,/WITH scoped_accounts AS/);
  assert.match(segment,/scoped_journal AS/);
  assert.match(segment,/FULL OUTER JOIN scoped_journal j/);
  assert.match(segment,/a\.participant_code=j\.participant_code AND a\.currency=j\.currency/);
  assert.equal((segment.match(/WHERE owner_id=\$\{ownerId\}::uuid AND group_key=\$\{groupKey\}/g)||[]).length,2);
  assert.match(segment,/COALESCE\(a\.participant_code,j\.participant_code\)/);
  assert.match(segment,/\(a\.participant_code IS NOT NULL\s+AND a\.balance_minor=COALESCE\(j\.sum_minor,0\)\) AS matches/);
  assert.match(segment,/AS "accountPresent"/);
  assert.match(segment,/AS "ledgerPresent"/);
  assert.doesNotMatch(segment,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO|FROM|public)/i);
});

test('orphan journal entry remains visible, marked drift, and not normalized into a false zero',()=>{
  const result=reconcileFixture([],[posting('o1','g1','P1','VES','100')],'o1','g1');
  assert.deepEqual(result,[{participantCode:'P1',currency:'VES',balanceMinor:'0',
    sumMinor:'100',matches:false,accountPresent:false,ledgerPresent:true}]);
});

test('account-only historical zero remains match, account-only nonzero is drift',()=>{
  const items=reconcileFixture([
    account('o1','g1','P1','VES','0'),account('o1','g1','P2','VES','500')
  ],[],'o1','g1');
  assert.deepEqual(items.map(x=>[x.participantCode,x.matches,x.accountPresent,x.ledgerPresent]),
    [['P1',true,true,false],['P2',false,true,false]]);
});

test('same participant and currency in different owner or group never net together',()=>{
  const accounts=[account('a','g','P1','USD','125')];
  const journal=[
    posting('a','g','P1','USD','125'),
    posting('b','g','P1','USD','-10000'),
    posting('a','another','P1','USD','-10000')
  ];
  assert.deepEqual(reconcileFixture(accounts,journal,'a','g').map(x=>[x.sumMinor,x.matches]),[['125',true]]);
  assert.deepEqual(reconcileFixture(accounts,journal,'b','g').map(x=>[x.sumMinor,x.matches]),[['-10000',false]]);
});

test('same participant amounts are exact integer minor units separated by currency',()=>{
  const journal=[
    posting('a','g','P1','USD','9007199254740993'),
    posting('a','g','P1','USD','-1'),
    posting('a','g','P1','VES','9007199254740993')
  ];
  const balances=[
    account('a','g','P1','USD','9007199254740992'),
    account('a','g','P1','VES','9007199254740993')
  ];
  const out=reconcileFixture(balances,journal,'a','g');
  assert.deepEqual(out.map(x=>[x.currency,x.sumMinor,x.matches]),
    [['USD','9007199254740992',true],['VES','9007199254740993',true]]);
});

test('journal reversals are summed as signed rows without editing the original',()=>{
  const journal=[posting('a','g','P1','VES','1700'),posting('a','g','P1','VES','-1700')];
  const result=reconcileFixture([account('a','g','P1','VES','0')],journal,'a','g');
  assert.equal(result[0].sumMinor,'0');
  assert.equal(result[0].matches,true);
  assert.equal(journal.length,2,'append-only remains unchanged');
});
