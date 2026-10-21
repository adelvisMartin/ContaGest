import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('#785 opt-in account listing never exposes a starter template as saved tenant accounts', () => {
  const routes = read('backend/src/modules/chart-accounts/chart-accounts.routes.ts');
  const service = read('frontend/src/services/chartAccountsService.js');
  assert.match(routes, /requirePermission\('accounting\.view'\)/);
  assert.match(routes, /req\.query\.persistedOnly\s*===\s*'true'\s*\?\s*accounts\s*:/);
  assert.match(service, /list\(\)\s*\{return BackendApi\.get\('\/chart-accounts\?persistedOnly=true'\)/);
});

test('#785 role binding retains server-backed readiness, authorization and persisted-account boundary', () => {
  const routes = read('backend/src/modules/chart-accounts/chart-accounts.routes.ts');
  const page = read('frontend/src/pages/ChartAccountsPage.js');
  assert.match(routes, /router\.post\('\/role-mappings',\s*requirePermission\('accounting\.post'\)/);
  assert.match(page, /chartAccountsLoaded\?allAccounts\.filter/);
  assert.match(page, /ChartAccountsService\.bindRole/);
  assert.match(page, /ChartAccountsService\.readiness\('sales'\)/);
});
