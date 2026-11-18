import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../backend/src/modules/purchases/purchase-draft.service.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../backend/src/modules/purchases/purchases.routes.ts', import.meta.url), 'utf8');

test('#757 deletion verifies tenant and authenticated actor before locking the invoice', () => {
  assert.match(service, /if \(!input\.tenantId \|\| !input\.actorId\)/);
  assert.match(service, /SELECT "id" FROM public\."PurchaseInvoice"/);
  assert.match(service, /WHERE "tenantId" = \$\{input\.tenantId\} AND "id" = \$\{input\.purchaseId\}/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /if \(!locked\.length\) throw new HttpError\(404/);
});

test('#757 draft delete, audit and response share an interactive transaction', () => {
  const tx = service.indexOf('return prisma.$transaction(async (tx) => {');
  const lock = service.indexOf('FOR UPDATE', tx);
  const loaded = service.indexOf('await tx.purchaseInvoice.findFirst(', lock);
  const status = service.indexOf("purchase.status !== 'draft'", loaded);
  const deleted = service.indexOf('await tx.purchaseInvoice.delete(', status);
  const audit = service.indexOf('await writeAudit({', deleted);
  const auditTx = service.indexOf('}, tx);', audit);
  const returned = service.indexOf('return { deleted: true, id: purchase.id }', auditTx);
  assert.ok(tx >= 0 && lock > tx && loaded > lock && status > loaded &&
    deleted > status && audit > deleted && auditTx > audit && returned > auditTx);
  assert.match(service.slice(audit, auditTx), /userId: input\.actorId/);
  assert.match(service.slice(audit, auditTx), /entityId: purchase\.id/);
  assert.match(service.slice(audit, auditTx), /before: purchase/);
});

test('#757 HTTP route delegates financial mutation; preserves old response and permissions', () => {
  assert.match(routes, /router\.use\(requireTenant, requirePermission\('purchases\.manage'\)\)/);
  const start = routes.indexOf("router.delete('/:id'");
  assert.ok(start >= 0);
  const endpoint = routes.slice(start, routes.indexOf('export default router;', start));
  assert.match(endpoint, /await deletePurchaseDraft\(\{/);
  assert.match(endpoint, /tenantId: ctx\.tenantId/);
  assert.match(endpoint, /actorId: requireActor\(ctx\)/);
  assert.match(endpoint, /purchaseId: req\.params\.id/);
  assert.match(endpoint, /ok\(res, result\)/);
  assert.doesNotMatch(endpoint, /prisma\.|await writeAudit\(|purchaseInvoice\.delete/);
});

test('#757 public issued cancellation remains on its existing reversible route', () => {
  assert.match(routes, /router\.patch\('\/:id\/cancel', validateBody\(cancellationSchema\)/);
  assert.match(routes, /await assertPeriodOpen\(ctx\.tenantId, reversalFiscalPeriod, tx\)/);
  assert.match(routes, /await copyLedgerLineSnapshotsForReversal\(/);
  assert.match(routes, /if \(purchase\.status === 'draft'\) throw new HttpError\(409/);
});

test('#757 PG17 audit-failure probe is scoped to disposable tenant, cleans trigger and checks rollback', () => {
  const qa = readFileSync(new URL('../qa/purchase-draft-atomic-v757.test.ts', import.meta.url), 'utf8');
  assert.match(qa, /createRealBackendHarness\(\)/);
  assert.match(qa, /LANGUAGE plpgsql AS \$\$/);
  assert.match(qa, /END;\s*\$\$`\);/);
  assert.match(qa, /DROP TRIGGER IF EXISTS/);
  assert.match(qa, /DROP FUNCTION IF EXISTS/);
  assert.match(qa, /await h\.status\(.*500.*DELETE/);
  assert.match(qa, /purchaseInvoiceLine\.count/);
  assert.match(qa, /foreign tenant draft is not exposed or deleted/);
});
