import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routes=readFileSync(new URL('../backend/src/modules/accounting/accounting.routes.ts',import.meta.url),'utf8');
const service=readFileSync(new URL('../backend/src/modules/accounting/accounting.service.ts',import.meta.url),'utf8');

function between(source,start,end){
  const first=source.indexOf(start);
  const last=source.indexOf(end,first+start.length);
  assert.ok(first>=0&&last>first,`Missing expected accounting command boundary: ${start}`);
  return source.slice(first,last);
}

test('#637 manual draft creation + forensic audit share the idempotent transaction',()=>{
  const create=between(routes,"router.post('/entries'","router.patch('/entries/:id'");
  const tx=create.indexOf('}, async (tx) => {');
  const inserted=create.indexOf('const entry = await createLedgerEntry(',tx);
  const audit=create.indexOf("action: 'ledger.entry.created'",inserted);
  const beforeReturn=create.indexOf("return { data: entry, resourceType: 'LedgerEntry'",inserted);
  const txEnd=create.indexOf('\n  });',beforeReturn);
  assert.ok(tx>=0&&inserted>tx&&audit>inserted&&beforeReturn>audit&&txEnd>beforeReturn,
    'ledger draft/audit/idempotency commit must share an interactive transaction');
  const mutation=create.slice(tx,txEnd);
  assert.match(mutation,/await writeAudit\(\{[\s\S]*?\}, tx\);/,
    'audit must fail closed on transaction rejection');
  assert.doesNotMatch(create.slice(txEnd),/ledger\.entry\.created/,
    'external best-effort audit after the commit is forbidden');
  assert.match(create,/if \(execution\.replayed\)/,
    'idempotency replay reporting remains explicit without re-creating ledger effects');
});

test('#637 draft edit is tenant-scoped, serialized and audited inside the domain transaction',()=>{
  const command=between(service,'export async function updateDraftLedgerEntry(','export async function deleteDraftLedgerEntry(');
  const order=['requirePostingActor(input.audit?.userId)','prisma.$transaction(async (tx)',
    'await lockScopedLedgerEntry(tx, input.tenantId, input.entryId)',
    'await tx.ledgerEntry.findFirst({',"assertLedgerActionAllowed(entry, 'edit')",
    'await assertPeriodOpen(input.tenantId, entry.fiscalPeriod, tx)',
    'const updated = await tx.ledgerEntry.update({','await writeAudit({',"action: 'ledger.entry.draft-updated'",
    '}, tx);','return updated;'];
  let previous=-1;
  for(const step of order){
    const at=command.indexOf(step,previous+1);
    assert.ok(at>previous,`draft edit must preserve ordered atomic gate: ${step}`);
    previous=at;
  }
  assert.match(command,/where: \{ id: input.entryId, tenantId: input.tenantId \}/);
  assert.match(command,/before: JSON.parse\(JSON.stringify\(entry\)\)/);
  assert.match(command,/after: \{ entry: JSON.parse\(JSON.stringify\(updated\)\)/);
});

test('#637 edit route delegates authority and actor audit context to service',()=>{
  const patch=between(routes,"router.patch('/entries/:id'","router.delete('/entries/:id'");
  assert.match(patch,/requirePermission\('accounting.post'\)/);
  assert.match(patch,/updateDraftLedgerEntry\(\{/);
  assert.match(patch,/entryId: req.params.id,/);
  assert.match(patch,/audit: \{ userId: ctx.userId,/);
  assert.doesNotMatch(patch,/prisma\.ledgerEntry\.|await writeAudit\(/,
    'route must not mutate/read finance state for a stale outside-transaction audit');
});
