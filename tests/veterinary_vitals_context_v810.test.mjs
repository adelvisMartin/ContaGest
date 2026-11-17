import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('#810 veterinary vitals use typed PostgreSQL lock and fail-closed context replay',()=>{
 const code=readFileSync('backend/src/modules/verticals/health-measurements.routes.ts','utf8');
 assert.match(code,/pg_advisory_xact_lock\(hashtextextended\(\$1,0\)\)::text AS locked/);
 assert.match(code,/sameContext=existing\.every/);
 assert.match(code,/previous\.encounterId/);
 assert.match(code,/metadata\.requestMeasuredAt/);
 assert.match(code,/requestMeasuredAt:body\.measuredAt\?\?null/);
 assert.match(code,/body\.patientId/);
 assert.match(code,/status\?200:201/);
});
