import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = 'backend/prisma/migrations/20261019110000_care_longitudinal_facts_v822/migration.sql';
const route = 'backend/src/modules/verticals/health-longitudinal.routes.ts';
const router = fs.readFileSync('backend/src/modules/verticals/health.routes.ts', 'utf8');

test('clinical fact schema uses tenant-scoped patient and encounter keys', () => {
  const sql = fs.readFileSync(migration, 'utf8');
  assert.match(sql, /CREATE TABLE public\."CareClinicalFact"/);
  assert.match(sql, /FOREIGN KEY \("tenantId", "patientId"\)/);
  assert.match(sql, /FOREIGN KEY \("tenantId", "patientId", "encounterId"\)/);
  assert.match(sql, /FOREIGN KEY \("tenantId", "patientId", "supersedesId"\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /private\.contagest_runtime_tenant_id\(\)/);
});

test('reviewed material is protected from in-place update and delete', () => {
  const sql = fs.readFileSync(migration, 'utf8');
  assert.match(sql, /IF TG_OP = 'DELETE'/);
  assert.match(sql, /OLD\."status" <> 'draft'/);
  assert.match(sql, /BEFORE UPDATE OR DELETE/);
  assert.match(sql, /"supersedesId".*UNIQUE|UNIQUE INDEX[^\n]*supersedes/s);
});

test('RLS denies direct browser principals and scopes least privilege runtime', () => {
  const sql = fs.readFileSync(migration, 'utf8');
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON public\."CareClinicalFact" TO contagest_runtime/);
  assert.match(sql, /contagest_runtime_tenant_id\(\)/);
  assert.doesNotMatch(sql, /GRANT SELECT, INSERT, UPDATE, DELETE[^\n]*authenticated/);
  assert.doesNotMatch(sql, /FOR ALL TO authenticated/);
  assert.match(sql, /"fingerprint" IS NOT NULL/);
  assert.match(sql, /"reviewedByUserId" IS NOT NULL/);
  assert.match(sql, /BEFORE INSERT ON public\."CareClinicalFact"/);
  assert.match(sql, /NEW\."status" <> 'draft'/);
});

test('all reads and writes are under tenant and patient authority', () => {
  const src = fs.readFileSync(route, 'utf8');
  assert.match(router, /healthLongitudinalRoutes/);
  assert.match(src, /requirePermission\('health\.manage'\)/);
  assert.match(src, /WHERE "tenantId"=\$1 AND "id"=\$2/);
  assert.match(src, /WHERE "tenantId"=\$1 AND "id"=\$2 AND "patientId"=\$3/);
  assert.match(src, /FOR UPDATE/);
  assert.match(src, /fingerprintCareFact/);
  assert.doesNotMatch(src, /req\.body\.tenantId/);
  assert.match(src, /FROM public\."CareProfessional"/);
  assert.match(src, /"userId"=\$2 AND "status"='active'/);
});

test('timeline is bounded and returns references instead of clinical payloads', () => {
  const src = fs.readFileSync(route, 'utf8');
  const timeline = src.slice(src.indexOf("router.get('/health/patients/:id/timeline'"));
  assert.match(timeline, /UNION ALL/);
  assert.match(timeline, /LIMIT \$[0-9]+/);
  assert.match(timeline, /encodeCareTimelineCursor/);
  assert.match(timeline, /decodeCareTimelineCursor/);
  assert.doesNotMatch(timeline, /SELECT \* FROM public\."CareClinicalFact"/);
});

test('fact history has a cursor and separates superseded from current reviewed versions', () => {
  const src = fs.readFileSync(route, 'utf8');
  const list = src.slice(src.indexOf("router.get('/health/patients/:id/facts'"),src.indexOf("router.post('/health/facts'"));
  assert.match(list, /decodeCareTimelineCursor\(req\.query\.cursor\)/);
  assert.match(list, /"supersedesId"=f\."id"/);
  assert.match(list, /"isSuperseded"/);
  assert.match(list, /nextCursor/);
  assert.match(list, /LIMIT \$5/);
});

test('draft POST uses a per-actor idempotency key and rejects mismatching replay', () => {
  const src = fs.readFileSync(route, 'utf8');
  const sql = fs.readFileSync(migration, 'utf8');
  assert.match(sql, /"requestKey"/);
  assert.match(sql, /"requestFingerprint"/);
  assert.match(sql, /UNIQUE INDEX "CareClinicalFact_request_idempotency/);
  assert.match(src, /pg_advisory_xact_lock/);
  assert.match(src, /fact\.idempotencyKey/);
  assert.match(src, /requestFingerprint !== requestFingerprint/);
  assert.match(src, /409, 'La clave de reintento/);
});
