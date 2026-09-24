import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  EPHEMERAL_DATABASE_PATTERN,
  LEGACY_BASELINE_MIGRATIONS,
  databaseNameFromUrl,
  isEphemeralDatabase
} from '../backend/scripts/prisma-deploy-safe.mjs';

test('ephemeral migration repair is restricted to disposable database suffixes',()=>{
  assert.equal(databaseNameFromUrl('postgresql://u:p@localhost:5432/contagest_rules_e2e?schema=public'),'contagest_rules_e2e');
  for(const suffix of ['_e2e','_drill','_restore']){
    assert.equal(isEphemeralDatabase(`postgresql://u:p@localhost:5432/contagest${suffix}`),true);
  }
  assert.equal(isEphemeralDatabase('postgresql://u:p@localhost:5432/contagest_prod'),false);
  assert.equal(EPHEMERAL_DATABASE_PATTERN.test('contagest'),false);
});

test('legacy baseline ends before password-hash delta so later migrations execute for real',()=>{
  assert.deepEqual(LEGACY_BASELINE_MIGRATIONS,[
    '0001_init',
    '0003_accounting_hr_fiscal_hardening',
    '0004_analytics_qr_barcode',
    '0005_food_orders_notifications_ai_demo'
  ]);
  assert.ok(!LEGACY_BASELINE_MIGRATIONS.includes('0006_auth_password_hash'));
});

test('ephemeral bootstrap owns the historical schema and deploy wrapper stays fail-closed',()=>{
  const bootstrap=fs.readFileSync('ops/database/prepare-supabase-ephemeral.sql','utf8');
  const deploy=fs.readFileSync('backend/scripts/prisma-deploy-safe.mjs','utf8');
  assert.match(bootstrap,/contagest_full_bootstrap_v8_5\.sql/);
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS auth\.users/);
  for(const column of ['id uuid PRIMARY KEY','email text','raw_app_meta_data jsonb','raw_user_meta_data jsonb']){
    assert.ok(bootstrap.includes(column),`missing auth.users compatibility column: ${column}`);
  }
  const canonicalHipicoProfile=fs.readFileSync('supabase/sql/hipico_v13_workspace_sync_security.sql','utf8');
  assert.match(canonicalHipicoProfile,/create table if not exists public\.hipico_profiles/i);
  const hipicoBaseline=[
    'hipico_v12_operations.sql',
    'hipico_v12_shadow_validation.sql',
    'hipico_v13_workspace_sync_security.sql'
  ];
  let previous=-1;
  for(const file of hipicoBaseline){
    const index=bootstrap.indexOf(file);
    assert.ok(index>previous,`missing or reordered canonical Hípico baseline: ${file}`);
    previous=index;
  }
  assert.doesNotMatch(bootstrap,/hipico_v13_lab_channel_bootstrap\.sql/);
  assert.doesNotMatch(bootstrap,/CREATE TABLE IF NOT EXISTS public\.hipico_profiles/i);
  assert.match(bootstrap,/CREATE OR REPLACE FUNCTION public\.hipico_set_updated_at\(\)/);
  assert.match(bootstrap,/NEW\.updated_at := now\(\);/);
  assert.match(bootstrap,/RETURN NEW;/);
  assert.match(bootstrap,/CREATE SCHEMA IF NOT EXISTS storage/);
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS storage\.buckets/);
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS storage\.objects/);
  assert.match(bootstrap,/CREATE OR REPLACE FUNCTION storage\.foldername/);
  assert.equal((bootstrap.match(/CREATE SCHEMA IF NOT EXISTS storage/g)||[]).length,1);
  assert.doesNotMatch(bootstrap,/AS \$\s/);
  assert.match(bootstrap,/AS \$fn\$/);
  assert.match(deploy,/EPHEMERAL_BASELINE_INCOMPLETE/);
  assert.match(deploy,/migrate', 'resolve', '--applied'/);
  assert.match(deploy,/migrate', 'deploy'/);
  assert.doesNotMatch(deploy,/migrate reset|db push/);
});


test('59/75 ephemeral Supabase Auth stub exposes only the migration-required credential field',()=>{
  const source=fs.readFileSync('ops/database/prepare-supabase-ephemeral.sql','utf8');
  assert.match(source,/CREATE TABLE IF NOT EXISTS auth\.users[\s\S]*encrypted_password text/);
  assert.match(source,/Refusing Supabase compatibility stubs in non-ephemeral database/);
  const migration=fs.readFileSync('backend/prisma/migrations/20260910063000_hipico_credential_status_no_password_storage/migration.sql','utf8');
  assert.match(migration,/nullif\(au\.encrypted_password, ''\) IS NOT NULL/);
  assert.doesNotMatch(migration,/INSERT INTO public\.hipico_users[\s\S]*encrypted_password/);
});
