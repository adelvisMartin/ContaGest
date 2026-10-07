import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('#856 pricing is one tenant-scoped authority with immutable used-price evidence',()=>{
  const migration=read('backend/prisma/migrations/20261005173000_issue_856_price_book_authority/migration.sql');
  const sync=read('backend/scripts/sync-employee-prisma-schema.mjs');
  const policy=read('backend/src/modules/pricing/price-resolution.policy.ts');
  const service=read('backend/src/modules/pricing/pricing.service.ts');
  const middleware=read('backend/src/modules/pricing/pricing-sales.middleware.ts');
  const routes=read('backend/src/modules/pricing/price-books.routes.ts');
  const index=read('backend/src/modules/index.ts');
  const manifest=read('backend/src/modules/route-manifest.ts');
  const backendPkg=JSON.parse(read('backend/package.json'));
  const rootPkg=JSON.parse(read('package.json'));

  for(const model of ['PriceBook','PriceBookLocation','PriceEntry','SalesLinePriceSnapshot']){
    assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS "${model}"`));
    assert.match(sync,new RegExp(`model ${model}\\s*\\{`));
  }
  assert.match(migration,/PRICE_PRODUCT_TENANT_MISMATCH/);
  assert.match(migration,/PRICE_LOCATION_TENANT_MISMATCH/);
  assert.match(migration,/PRICE_ENTRY_EFFECTIVE_OVERLAP/);
  assert.match(migration,/CREATE EXTENSION IF NOT EXISTS btree_gist/);
  assert.match(migration,/PriceEntry_no_active_overlap/);
  assert.match(migration,/PriceEntry_target_version_key/);
  assert.match(migration,/USED_PRICE_ENTRY_IMMUTABLE/);
  assert.match(migration,/PRICE_SNAPSHOT_IMMUTABLE/);
  assert.match(migration,/LEGACY_PRODUCT/);
  assert.match(migration,/Product_sync_legacy_price/);
  assert.match(migration,/SalesInvoiceLine_price_snapshot/);
  assert.match(migration,/IF inv\.status='draft' THEN RETURN NEW; END IF;/);
  assert.match(backendPkg.scripts['migration:test:from-zero'],/test:pricing:postgres/);
  assert.match(backendPkg.scripts['migration:test:upgrade'],/test:pricing:postgres/);
  assert.match(rootPkg.scripts['test:backend:persistence:real'],/price-book-authority-v856\.test\.ts/);
  assert.doesNotMatch(migration,/\beval\s*\(/i);

  assert.match(policy,/Prisma\.Decimal/);
  assert.match(policy,/PRICE_AUTHORITY_AMBIGUOUS/);
  assert.match(policy,/PRICE_FX_EVIDENCE_REQUIRED/);
  assert.doesNotMatch(policy,/parseFloat|toNumber\(|Math\.round/);
  assert.doesNotMatch(service,/product\.price|select:\s*\{[^}]*price\s*:/s);
  assert.match(service,/targetType: 'product' \| 'service'/);
  assert.match(service,/PRICE_SERVICE_AUTHORITY_UNAVAILABLE/);
  assert.match(middleware,/resolved\.amount\.toFixed\(2\)/);
  assert.ok(index.indexOf('enforceCanonicalSalesPricing')<index.indexOf('mountModuleRouteManifest(router)'),'pricing must run before Sales route totals');
  assert.match(manifest,/id: 'price-books'.*path: '\/price-books'/s);
  assert.match(routes,/requirePermission\('sales\.manage'\)/);
  assert.match(routes,/expectedVersion/);
  assert.match(routes,/PRICE_BOOK_VERSION_CONFLICT/);
  assert.match(routes,/pg_advisory_xact_lock/);
  assert.match(routes,/\/preview\/resolve/);
  assert.doesNotMatch(routes,/router\.delete\s*\(/i);
});

test('#856 admin UI delegates resolution to backend and exposes effective price management',()=>{
  const registry=read('frontend/src/data/pageRegistry.js');
  const page=read('frontend/src/pages/PriceBooksPage.js');
  const api=read('frontend/src/services/priceBooksService.js');
  assert.match(registry,/'listas-precio': \['\.\/pages\/PriceBooksPage\.js'/);
  assert.match(page,/PriceBooksService\.preview/);
  assert.match(page,/BusinessLocationsService\.list/);
  assert.match(page,/ErpDataTable/);
  assert.match(page,/effectiveFrom/);
  assert.doesNotMatch(page,/price\s*\*\s*fx|fx\s*\*\s*price/i);
  assert.match(api,/\/price-books\/preview\/resolve/);
  assert.doesNotMatch(api,/tenantId\s*:/);
});
