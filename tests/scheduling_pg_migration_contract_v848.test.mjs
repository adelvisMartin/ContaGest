import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../backend/prisma/migrations/20261015191500_issue_848_exclusive_resource_allocation/migration.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../backend/prisma/schema.prisma', import.meta.url), 'utf8');

test('migration is append-only and creates resource, booking, allocation as separate canonical entities', () => {
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
  for (const model of ['SchedulingResource', 'SchedulingBooking', 'SchedulingResourceAllocation']) {
    assert.match(schema, new RegExp('model ' + model + ' \\{'));
    assert.match(sql, new RegExp('CREATE TABLE public\\."' + model + '"'));
  }
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM|UPDATE "Tenant"|ALTER TABLE "Tenant")\b/i);
});

test('DB GiST constraint independently rejects same-resource overlapping active ranges', () => {
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS btree_gist/);
  assert.match(sql, /EXCLUDE USING gist\s*\([\s\S]*?"tenantId" WITH =,[\s\S]*?"resourceId" WITH =,[\s\S]*?tstzrange\("occupiedStartAt","occupiedEndAt",'\[\)'\) WITH &&\s*\)\s*WHERE \("status" = 'active'\)/);
  assert.match(sql, /"SchedulingResourceAllocation_dates_chk" CHECK \("occupiedEndAt" > "occupiedStartAt"\)/);
  assert.match(sql, /"SchedulingResource_capacity_chk" CHECK \("capacity" = 1\)/);
});

test('tenant+location composite foreign keys exist independently of application authentication', () => {
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS "BusinessLocation_tenantId_id_key"/);
  assert.match(sql, /FOREIGN KEY \("tenantId", "locationId"\)[\s\S]*?REFERENCES public\."BusinessLocation" \("tenantId", "id"\)/);
  assert.match(sql, /FOREIGN KEY \("tenantId","locationId","bookingId"\)[\s\S]*?REFERENCES public\."SchedulingBooking" \("tenantId","locationId","id"\)/);
  assert.match(sql, /FOREIGN KEY \("tenantId","locationId","resourceId"\)[\s\S]*?REFERENCES public\."SchedulingResource" \("tenantId","locationId","id"\)/);
});

test('all scheduling tables FORCE tenant RLS and missing context fails closed', () => {
  for (const model of ['SchedulingResource', 'SchedulingBooking', 'SchedulingResourceAllocation']) {
    assert.match(sql, new RegExp('ALTER TABLE public\\."' + model + '" FORCE ROW LEVEL SECURITY'));
    assert.match(sql, new RegExp('CREATE POLICY "' + model + '_tenant_guard"'));
  }
  assert.match(sql, /current_setting\('contagest\.tenant_id',true\)/);
  assert.match(sql, /NULLIF\(current_setting\('contagest\.tenant_id',true\),''\)/);
  assert.match(sql, /REVOKE ALL ON TABLE/);
  assert.match(sql, /TO contagest_runtime/);
  assert.doesNotMatch(sql, /\bDISABLE ROW LEVEL SECURITY\b/);
});

test('booking idempotency and allocation claim identities cannot duplicate', () => {
  assert.match(sql, /UNIQUE INDEX "SchedulingBooking_tenant_idempotency_key"/);
  assert.match(sql, /UNIQUE INDEX "SchedulingResourceAllocation_booking_step_resource_key"/);
  assert.match(sql, /"SchedulingBooking_dates_chk" CHECK \("endsAtUtc" > "startsAtUtc"\)/);
  assert.match(sql, /"SchedulingBooking_status_chk" CHECK \("status" IN \('confirmed','cancelled'\)\)/);
});
