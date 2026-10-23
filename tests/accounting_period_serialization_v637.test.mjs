import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../backend/src/modules/accounting/accounting.service.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../backend/src/modules/accounting/accounting.routes.ts', import.meta.url), 'utf8');

test('#637 period writes and close use one transaction-scoped advisory lock key', () => {
  assert.match(service, /pg_advisory_xact_lock\(hashtextextended\(/);
  assert.match(service, /cg:ledger-period:v1:\$\{tenantId\}:\$\{fiscalPeriod\}/);
  assert.match(service, /if \(db !== prisma\) await lockAccountingPeriodMutation\(tenantId, fiscalPeriod,/);
  const post = service.split('export async function postLedgerEntry(')[1].split('export async function reverseLedgerEntry(')[0];
  assert.match(post, /await assertPeriodOpen\(input\.tenantId, entry\.fiscalPeriod, tx\)/);
  const reversal = service.split('export async function reverseLedgerEntry(')[1].split('type PostingAccounts')[0];
  assert.match(reversal, /await assertPeriodOpen\(input\.tenantId, input\.fiscalPeriod, tx\)/);
  const close = service.split('export async function closeAccountingPeriod(')[1].split('function normalizeLedgerLines')[0];
  assert.match(close, /await lockAccountingPeriodMutation\(input\.tenantId, candidate\.period, tx\)/);
  assert.ok(close.indexOf('await lockAccountingPeriodMutation') < close.indexOf('FOR UPDATE'));
});

test('#637 create period and its audit now belong to one domain transaction', () => {
  const command = service.split('export async function createAccountingPeriod(')[1].split('export async function closeAccountingPeriod(')[0];
  assert.match(command, /requirePostingActor/);
  assert.match(command, /prisma\.\$transaction\(async tx/);
  assert.match(command, /await lockAccountingPeriodMutation/);
  assert.match(command, /tx\.closingPeriod\.create/);
  assert.match(command, /tx\.auditLog\.create/);
  const route = routes.split("router.post('/closing-periods'")[1].split("\n}));")[0];
  assert.match(route, /await createAccountingPeriod/);
  assert.doesNotMatch(route, /prisma\.closingPeriod\.(create|update)/);
});

test('#637 no db-root mutex is mistakenly claimed to survive a write', () => {
  assert.match(service, /if \(db !== prisma\)/);
  assert.match(service, /all.*posting.*close|Every accounting posting\/close writer/i);
});

test('#637 period format accepts valid months, rejects malformed month and slash escapes', () => {
  const regexLiteral=service.match(/const PERIOD_CODE = (\/[^\n]+\/);/)?.[1];
  assert.ok(regexLiteral,'accounting period grammar absent');
  const format = new Function('return '+regexLiteral)();
  assert.ok(format.test('2026-10'));
  assert.ok(format.test('2099-01'));
  for(const input of ['2026-00','2026-13','2026-1','2026-10junk','\\d{4}-10'])
    assert.equal(format.test(input),false,input);
});

test('#637 draft ledger cannot bypass the domain transaction lock with root Prisma', () => {
  const create = service.split('export async function createLedgerEntry(')[1].split('async function lockScopedLedgerEntry(')[0];
  assert.match(create, /if \(!db \|\| db === prisma\)/);
  assert.match(create, /await assertPeriodOpen\(input\.tenantId, input\.fiscalPeriod, db\)/);
  assert.match(create, /return db\.ledgerEntry\.create/);
  assert.doesNotMatch(create, /AccountingDb = prisma/);
});
