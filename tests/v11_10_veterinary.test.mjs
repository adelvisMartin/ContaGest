import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const required = [
  'backend/src/modules/verticals/veterinary.routes.ts',
  'backend/prisma/migrations/20260731055200_v11_10_veterinary_clinical_operations/migration.sql',
  'frontend/src/pages/VeterinaryClinicPage.jsx',
  'frontend/src/services/urlStateService.js',
  'frontend/src/services/queryParamEnhancer.js',
  'frontend/src/styles/compact-enterprise-v1110.css'
];

test('v11.10 veterinary and compact UI files exist', () => {
  required.forEach((path) => assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, path));
});

test('compact density layer loads after legacy style layers', () => {
  const app = read('frontend/src/app.js');
  assert.match(app, /styles\/erp-runtime\.css/);
  const system = read('frontend/src/styles/erp-system.css');
  const legacy = system.indexOf("./legacy/precision-ledger.css");
  const compact = system.indexOf("./legacy/compact-enterprise-v1110.css");
  assert.ok(legacy >= 0 && compact > legacy);
  const css = read('frontend/src/styles/legacy/compact-enterprise-v1110.css');
  assert.match(css, /--cg-shell-sidebar:248px/);
  assert.match(css, /cgx-page-header h1/);
  assert.match(css, /pretest-hero h2/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.doesNotMatch(css, /zoom\s*:/);
});

test('every module is routed through safe query parameters and browser history', () => {
  const router = read('frontend/src/services/urlStateService.js');
  const enhancer = read('frontend/src/services/queryParamEnhancer.js');
  const app = read('frontend/src/app.js');
  assert.match(router, /ROUTE_PARAM = 'module'/);
  assert.match(router, /pushState/);
  assert.match(router, /replaceState/);
  assert.match(router, /popstate/);
  assert.match(router, /SAFE_KEYS/);
  assert.match(router, /tab.*view.*patient/s);
  assert.match(enhancer, /input\[type="search"\]/);
  assert.match(enhancer, /pageSize/);
  assert.match(app, /UrlStateService\.bootstrap/);
  assert.match(app, /QueryParamEnhancer\.mount/);
});

test('veterinary page uses local React MUI and react-hot-toast', () => {
  const page = read('frontend/src/pages/VeterinaryClinicPage.jsx');
  assert.match(page, /from '@mui\/material'/);
  assert.match(page, /from 'react-hot-toast'/);
  assert.match(page, /createTheme/);
  assert.match(page, /Toaster/);
  assert.match(page, /toast\.promise/);
  assert.match(page, /variant="scrollable"/);
  ['historia','laboratorio','estudios','hospitalizacion','procedimientos','comunicaciones'].forEach((tab) => assert.match(page, new RegExp(tab)));
});

test('veterinary API is tenant and permission protected', () => {
  const api = read('backend/src/modules/verticals/veterinary.routes.ts');
  const index = read('backend/src/modules/index.ts');
  assert.match(api, /router\.use\(requireTenant, requirePermission\('health\.manage'\)\)/);
  assert.match(index, /verticals\/veterinary/);
  ['lab-orders','lab-results','studies','hospitalizations','observations','procedures','communications'].forEach((route) => assert.match(api, new RegExp(route)));
  assert.match(api, /CarePatient.*kind.*animal/s);
  assert.match(api, /inferFlag/);
});

test('veterinary migration is additive and enables RLS for all clinical tables', () => {
  const migration = read('backend/prisma/migrations/20260731055200_v11_10_veterinary_clinical_operations/migration.sql');
  const tables = ['CareLabOrder','CareLabResult','CareDiagnosticStudy','CareHospitalization','CareHospitalObservation','CareProcedure','CareCommunicationLog'];
  tables.forEach((table) => {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\."${table}"`));
    assert.match(migration, new RegExp(`ALTER TABLE public\\."${table}" ENABLE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`${table}_tenant_authenticated_all`));
  });
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});

test('appointment follow-up supports WhatsApp email and audit logging', () => {
  const page = read('frontend/src/pages/VeterinaryClinicPage.jsx');
  const api = read('backend/src/modules/verticals/veterinary.routes.ts');
  assert.match(page, /https:\/\/wa\.me/);
  assert.match(page, /mailto:/);
  assert.match(page, /createCommunication/);
  assert.match(api, /CareCommunicationLog/);
  assert.match(api, /appointment_reminder|communications/);
});
