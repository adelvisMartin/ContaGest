import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');
test('#748 vaccine replay uses immutable tenant-key identity, serial lock and fingerprint',()=>{
 const block=read('backend/src/modules/verticals/health-measurements.routes.ts').split("router.post('/health/immunizations'")[1];
 assert.match(block,/createHash\('sha256'\)/);
 assert.match(block,/pg_advisory_xact_lock\(hashtextextended\(\$1,0\)\)::text AS locked/);
 assert.match(block,/"tenantId"=\$1 AND "requestKey"=\$2/);
 assert.match(block,/requestFingerprint!==fingerprint/);
 assert.match(block,/throw new HttpError\(409/);
 assert.match(block,/result\.replayed\?200:201/);
 assert.match(block,/"kind"='animal' AND "active"=true/);
});
test('#748 migration preserves existing clinical records, enforces unique tenant/key',()=>{
 const m=read('backend/prisma/migrations/20261117160500_veterinary_immunization_replay_v748/migration.sql');
 assert.match(m,/ADD COLUMN IF NOT EXISTS "requestKey"/);
 assert.match(m,/ADD COLUMN IF NOT EXISTS "requestFingerprint"/);
 assert.match(m,/CREATE UNIQUE INDEX IF NOT EXISTS/);
 assert.match(m,/\("tenantId","requestKey"\)/);
 assert.doesNotMatch(m,/DROP TABLE|DELETE FROM|TRUNCATE/);
});
test('#748 vaccine UI preserves retry key until server ACK and remounts per patient',()=>{
 const panel=read('frontend/src/components/veterinary/VeterinaryPreventiveCarePanel.jsx');
 const page=read('frontend/src/pages/VeterinaryClinicPageV1123.jsx');
 assert.match(panel,/vaccineRequestKeyRef\.current=globalThis\.crypto\.randomUUID\(\)/);
 assert.match(panel,/requestKey:vaccineRequestKeyRef\.current/);
 assert.match(panel,/vaccineRequestKeyRef\.current=''/);
 assert.match(page,/key=\{selected\.id\}/);
});
