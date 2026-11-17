import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync('backend/src/modules/verticals/health-dental-chart-history.routes.ts','utf8');
const gateway=readFileSync('backend/src/modules/verticals/health.routes.ts','utf8');
const schemas=readFileSync('backend/src/modules/verticals/health.schemas.ts','utf8');
const scheduling=readFileSync('backend/src/modules/verticals/health.route-helpers.ts','utf8');
const service=readFileSync('frontend/src/services/verticalService.js','utf8');
const page=readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');
const panel=readFileSync('frontend/src/components/dentistry/DentalChartHistoryPanel.jsx','utf8');

test('#747 current is derived from signed encounters only, fail-closed on ambiguous history',()=>{
  assert.match(api,/sourceAuthority:'CareEncounter\.signed'/);
  assert.doesNotMatch(api,/from 'zod'|\bz\.(?:object|enum|string)\(/);
  assert.match(api,/dentalChartHistoryQuerySchema\.safeParse/);
  assert.match(schemas,/export const dentalChartHistoryQuerySchema/);
  assert.match(scheduling,/pg_advisory_xact_lock\(hashtextextended\(\$1,0\)\)::text AS locked/);
  assert.match(api,/requirePermission\('health.manage'\)/);
  assert.match(api,/patient\[0\]\.kind!=='human'/);
  assert.match(api,/dentalClinicalDataSchema\.safeParse/);
  assert.match(api,/periodontalClinicalDataSchema\.safeParse/);
  assert.match(api,/record\.status!=='signed'/);
  assert.match(api,/if\(!unprojectable\.length\)/);
  assert.match(api,/records\.length>500/);
});
test('#747 UI reuses canonical clinical service, has no untrusted cached patient state',()=>{
  assert.match(gateway,/router\.use\(dentalChartHistoryRoutes\)/);
  assert.match(service,/dentalChartHistory\(patientId\)/);
  assert.match(page,/<DentalChartHistoryPanel/);
  assert.match(panel,/request\.current\+=1/);
  assert.match(panel,/cg:pwa-session-changed/);
  for(const label of ['Verificando historial','Reconstrucción incompleta',
    'Historia de versiones firmadas','Estado actual validado','Sin encuentros firmados'])
    assert.ok(panel.includes(label),label);
  assert.doesNotMatch(panel,/localStorage\.setItem|innerHTML|<style/);
});
