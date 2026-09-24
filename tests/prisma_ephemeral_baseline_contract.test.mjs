import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  EPHEMERAL_DATABASE_PATTERN,
  LEGACY_BASELINE_MIGRATIONS,
  databaseNameFromUrl,
  isEphemeralDatabase
} from '../backend/scripts/prisma-deploy-safe.mjs';

test('ephemeral Prisma baseline is restricted to explicit disposable database suffixes',()=>{
  assert.equal(databaseNameFromUrl('postgresql://u:p@localhost:5432/contagest_rules_e2e?schema=public'),'contagest_rules_e2e');
  for(const suffix of ['_e2e','_drill','_restore']){
    assert.equal(isEphemeralDatabase(`postgresql://u:p@localhost:5432/contagest${suffix}`),true);
  }
  assert.equal(isEphemeralDatabase('postgresql://u:p@localhost:5432/contagest_prod'),false);
  assert.equal(EPHEMERAL_DATABASE_PATTERN.test('contagest'),false);
});

test('legacy baseline stops before passwordHash migration so later deltas execute for real',()=>{
  assert.deepEqual(LEGACY_BASELINE_MIGRATIONS,[
    '0001_init',
    '0003_accounting_hr_fiscal_hardening',
    '0004_analytics_qr_barcode',
    '0005_food_orders_notifications_ai_demo'
  ]);
  assert.ok(!LEGACY_BASELINE_MIGRATIONS.includes('0006_auth_password_hash'));
});

test('deploy wrapper verifies baseline tables and never baselines arbitrary databases',()=>{
  const source=fs.readFileSync('backend/scripts/prisma-deploy-safe.mjs','utf8');
  assert.match(source,/requiredTables = \['Tenant', 'UserProfile', 'Product', 'AnalyticsEvent', 'FoodOrder'\]/);
  assert.match(source,/if \(isEphemeralDatabase\(databaseUrl\)\)/);
  assert.match(source,/migrate', 'resolve', '--applied'/);
  assert.match(source,/migrate', 'deploy'/);
});
