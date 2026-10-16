/**
 * #848 PG17 two-writer and cross-tenant negative test.
 * ONLY a disposable localhost database named contagest_*_e2e.
 * Requires the full migration chain and contagest_runtime role, never production.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const target = process.env.SCHEDULING_PG17_E2E_URL;
if (!target) throw new Error('PG17_NOT_EXECUTED: SCHEDULING_PG17_E2E_URL is required');
let url;
try { url = new URL(target); } catch { throw new Error('PG17_UNSAFE_TARGET'); }
const dbName = decodeURIComponent(url.pathname.substring(1));
if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
    !/^contagest_[a-z0-9_]+_e2e$/.test(dbName) ||
    !['postgresql:', 'postgres:'].includes(url.protocol)) {
  throw new Error('PG17_UNSAFE_TARGET: localhost, contagest_*_e2e only');
}
const { Client } = createRequire(new URL('../backend/package.json', import.meta.url))('pg');
const open = async () => { const c = new Client({ connectionString: target }); await c.connect(); return c; };
const uuid = () => randomUUID();
const a = uuid(), b = uuid(), la = uuid(), lb = uuid(), resource = uuid();
const bookingA = uuid(), bookingB = uuid(), bookingCross = uuid();
const at = (minute) => new Date(Date.UTC(2026, 10, 15, 10, minute)).toISOString();
const start = at(0), end = at(60);
async function beginTenant(client, tenant) {
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE contagest_runtime');
  await client.query("SELECT set_config('contagest.tenant_id',$1,true)", [tenant]);
}
async function book(client, tenant, location, bookingId, from=start, to=end) {
  return client.query(
    'INSERT INTO public."SchedulingBooking" ("id","tenantId","locationId","sourceType","sourceId","idempotencyKey","startsAtUtc","endsAtUtc","createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [bookingId,tenant,location,'dental',uuid(),uuid(),from,to,'synthetic-actor']);
}
async function claim(client, tenant, location, bookingId, resourceId, from=start, to=end) {
  return client.query(
    'INSERT INTO public."SchedulingResourceAllocation" ("id","tenantId","locationId","bookingId","resourceId","stepId","occupiedStartAt","occupiedEndAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [uuid(),tenant,location,bookingId,resourceId,'stage-1',from,to]);
}
const owner = await open(), one = await open(), two = await open();
let seeded = false;
try {
  const v = Number((await owner.query('SHOW server_version_num')).rows[0].server_version_num);
  assert.ok(v >= 170000 && v < 180000, 'require PostgreSQL 17, not a simulated database');
  const facts = await owner.query('SELECT (SELECT count(*)::int FROM pg_constraint WHERE conrelid = \'public."SchedulingResourceAllocation"\'::regclass AND conname = \'SchedulingResourceAllocation_no_active_overlap\') AS constraint_count, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = \'contagest_runtime\') AS has_runtime');
  assert.equal(facts.rows[0].constraint_count, 1);
  assert.equal(facts.rows[0].has_runtime, true);
  const digits = BigInt('0x' + a.replaceAll('-','').slice(0,10)).toString().slice(-8).padStart(8,'0');
  await owner.query('BEGIN');
  await owner.query('INSERT INTO public."Tenant" ("id","rif","name") VALUES ($1,$2,$3),($4,$5,$6)', [a,'J-'+digits+'-0','Synthetic A',b,'J-'+digits+'-1','Synthetic B']);
  await owner.query('INSERT INTO public."BusinessLocation" ("id","tenantId","code","name","timezone") VALUES ($1,$2,$3,$4,$5),($6,$7,$8,$9,$10)', [la,a,'E2E_A','Synthetic A','America/Caracas',lb,b,'E2E_B','Synthetic B','America/Caracas']);
  await owner.query('INSERT INTO public."SchedulingResource" ("id","tenantId","locationId","code","kind") VALUES ($1,$2,$3,$4,$5)', [resource,a,la,'CHAIR_A','room']);
  await owner.query('COMMIT');
  seeded = true;

  await beginTenant(one,a);
  await book(one,a,la,bookingA);
  await claim(one,a,la,bookingA,resource);
  await beginTenant(two,a);
  await book(two,a,la,bookingB);
  // The database must serialize/exclude the competing claim. Do not sleep.
  const contender = claim(two,a,la,bookingB,resource).then(()=>null,error=>error);
  await one.query('COMMIT');
  const conflict = await contender;
  assert.equal(conflict?.code,'23P01','two writers cannot both commit an exclusive resource');
  await two.query('ROLLBACK');

  // A contiguous [end,nextStart) reservation must be allowed.
  await beginTenant(two,a);
  const adjacent = uuid();
  await book(two,a,la,adjacent,end,at(90));
  await claim(two,a,la,adjacent,resource,end,at(90));
  await two.query('ROLLBACK');

  // Tenant B may not read tenant A allocations or claim its resource.
  await beginTenant(two,b);
  const visible = await two.query('SELECT count(*)::int AS n FROM public."SchedulingResourceAllocation" WHERE "resourceId"=$1',[resource]);
  assert.equal(visible.rows[0].n,0);
  await book(two,b,lb,bookingCross);
  const violation = await claim(two,b,lb,bookingCross,resource).then(()=>null,error=>error);
  assert.ok(['23503','42501'].includes(violation?.code),'cross-tenant FK/RLS rejects spoofed resource');
  await two.query('ROLLBACK');

  await two.query('BEGIN');
  await two.query('SET LOCAL ROLE contagest_runtime');
  const withoutContext = await two.query('SELECT count(*)::int AS n FROM public."SchedulingResourceAllocation" WHERE "resourceId"=$1',[resource]);
  assert.equal(withoutContext.rows[0].n,0);
  await two.query('ROLLBACK');
  console.log('PG17 PASS: two writers, 23P01 exclusion, adjacency, tenant A/B, missing context');
} finally {
  await Promise.allSettled([one.query('ROLLBACK'),two.query('ROLLBACK')]);
  if (seeded) {
    try {
      await owner.query('BEGIN');
      await owner.query('DELETE FROM public."SchedulingResourceAllocation" WHERE "tenantId"=$1',[a]);
      await owner.query('DELETE FROM public."SchedulingBooking" WHERE "tenantId" IN ($1,$2)',[a,b]);
      await owner.query('DELETE FROM public."SchedulingResource" WHERE "tenantId"=$1',[a]);
      await owner.query('DELETE FROM public."BusinessLocation" WHERE "id" IN ($1,$2)',[la,lb]);
      await owner.query('DELETE FROM public."Tenant" WHERE "id" IN ($1,$2)',[a,b]);
      await owner.query('COMMIT');
    } catch (error) {
      await owner.query('ROLLBACK');
      console.error('DISPOSABLE_DATABASE_CLEANUP_FAILED: destroy throwaway DB');
      throw error;
    }
  }
  await Promise.allSettled([one.end(),two.end(),owner.end()]);
}
