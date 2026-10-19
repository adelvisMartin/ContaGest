import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const accounting = read('../backend/src/modules/accounting/accounting.service.ts');
const resolver = read('../backend/src/modules/chart-accounts/account-role.repository.ts');
const sales = read('../backend/src/modules/sales/sales.routes.ts');
const purchases = read('../backend/src/modules/purchases/purchases.routes.ts');
const routes = read('../backend/src/modules/chart-accounts/chart-accounts.routes.ts');

test('#785 sales and purchases use bound semantic roles, no embedded account codes in ledger templates', () => {
  assert.doesNotMatch(accounting.slice(accounting.indexOf('export function salesInvoiceLinesForLedger')), /accountCode:\s*['"][\d.]+['"]/);
  assert.match(sales, /await resolveSemanticPostingAccounts\(tx, ctx\.tenantId, requiredRoles\)/);
  assert.match(purchases, /await resolveSemanticPostingAccounts\(tx, ctx\.tenantId, \['cost_of_sales', 'vat_input', 'ap'\]\)/);
  assert.match(sales, /assertBalanced\(ledgerLines\)/);
  assert.match(purchases, /assertBalanced\(ledgerLines\)/);
});

test('#785 resolver has same-tenant composite account lookup and refuses missing/non-postable role maps', () => {
  assert.match(resolver, /JOIN public\."ChartAccount" a/);
  assert.match(resolver, /a\."tenantId"=m\."tenantId" AND a\."code"=m\."accountCode"/);
  assert.match(resolver, /WHERE m\."tenantId"=\$\{tenantId\}/);
  assert.match(resolver, /assertSemanticPostingRoles\(tenantId, roles, rows\)/);
  assert.match(resolver, /ACCOUNT_ROLE_POSTING_NOT_READY/);
  assert.match(routes, /router\.get\('\/role-mappings\/readiness', requirePermission\('accounting\.view'\)/);
});
