import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  API_CONTRACT_VERSION,
  assertNoRouteConflicts,
  buildApiContract,
  compareApiContracts,
  normalizeApiPath,
  stableContractHash,
  validateEnvelopeSources,
} from '../scripts/api-contract-authority-v652.mjs';

const route = (overrides = {}) => ({
  method: 'GET', path: '/api/v1/clients',
  auth: { tenantRequired: true, permissions: ['clients.manage'] },
  request: { bodySchema: null }, responses: { success: [200], errors: [401, 403] }, deprecated: false,
  ...overrides,
});
const manifest = (routes, errorEnvelope = { required: ['ok', 'code', 'message', 'correlationId'], optional: ['requestId', 'details'] }) => ({
  schemaVersion: 652, apiVersion: API_CONTRACT_VERSION,
  conventions: {
    successEnvelope: { required: ['ok', 'data', 'meta'] },
    errorEnvelope,
    correlationHeader: 'x-correlation-id',
    pagination: { style: 'take-skip', takeDefault: 100, takeMax: 500, skipMax: 1000000, headers: ['X-CG-Page-Take', 'X-CG-Page-Skip'] },
  }, routes,
});

test('path normalization is deterministic for mounted and dynamic routes', () => {
  assert.equal(normalizeApiPath('/api/v1/', '/clients/:id'), '/api/v1/clients/:id');
  assert.equal(normalizeApiPath('/api/v1', '/'), '/api/v1');
});
test('duplicate method/path contracts fail closed', () => {
  assert.throws(() => assertNoRouteConflicts([route(), route()]), /API_CONTRACT_DUPLICATE_ROUTE:GET \/api\/v1\/clients/);
});
test('compatibility gate rejects removed routes, stricter RBAC, schema drift and removed success codes', () => {
  const base = manifest([route()]);
  assert.match(compareApiContracts(base, manifest([])).breaking.join('\n'), /ROUTE_REMOVED/);
  assert.match(compareApiContracts(base, manifest([route({ auth: { tenantRequired: true, permissions: ['clients.manage', 'clients.export'] } })])).breaking.join('\n'), /RBAC_TIGHTENED/);
  assert.match(compareApiContracts(base, manifest([route({ request: { bodySchema: 'sha256:new' } })])).breaking.join('\n'), /REQUEST_SCHEMA_CHANGED/);
  assert.match(compareApiContracts(manifest([route({ responses: { success: [200, 201], errors: [401, 403] } })]), base).breaking.join('\n'), /SUCCESS_STATUS_REMOVED/);
});
test('additive routes, error statuses and error envelope fields remain backwards compatible', () => {
  const base = manifest([route()]);
  const expandedEnvelope = { required: [...base.conventions.errorEnvelope.required, 'type', 'title', 'status', 'detail'], optional: [...base.conventions.errorEnvelope.optional, 'instance'] };
  const next = manifest([route({ responses: { success: [200], errors: [401, 403, 422] } }), route({ method: 'POST', path: '/api/v1/clients/search' })], expandedEnvelope);
  const comparison = compareApiContracts(base, next);
  assert.deepEqual(comparison.breaking, []);
  assert.match(comparison.additive.join('\n'), /ERROR_ENVELOPE_FIELDS_ADDED/);
});
test('manifest hash is stable across object-key ordering', () => {
  assert.equal(stableContractHash({ b: 2, a: 1 }), stableContractHash({ a: 1, b: 2 }));
});
test('canonical success/error envelopes and correlation are verified from source, not duplicated docs', () => {
  const httpSource = `res.status(httpStatus).json({ ok: true, data, meta });`;
  const errorSource = `return res.json(buildErrorEnvelope(normalized, context));`;
  const observabilitySource = `const correlationHeader='x-correlation-id'; return { ok: false, type, title, status, detail, instance, code, message, correlationId, requestId, details };`;
  assert.doesNotThrow(() => validateEnvelopeSources({ httpSource, errorSource, observabilitySource }));
  assert.throws(() => validateEnvelopeSources({ httpSource: 'json({data})', errorSource, observabilitySource }), /API_SUCCESS_ENVELOPE_DRIFT/);
});

test('source projection follows app mounts, module manifest, CRUD generation, RBAC and canonical observability', () => {
  const sources = {
    'backend/src/app.ts': `import apiRoutes from './modules/index.js'; import authRoutes from './modules/auth/auth.routes.js'; import { registerHealthRoutes } from './shared/observability/health.js'; const app:any={}; registerHealthRoutes(app); app.use('/api/v1/auth', authRoutes); app.use('/api/v1', apiRoutes);`,
    'backend/src/modules/index.ts': `import { mountModuleRouteManifest } from './route-manifest.js'; const router:any={}; mountModuleRouteManifest(router); router.get('/health/db', requireTenant, (_q:any,r:any)=>r.json({ok:true,data:{}})); export default router;`,
    'backend/src/modules/route-manifest.ts': `import authzRoutes from './custom/custom.routes.js'; export const MODULE_ROUTE_MANIFEST=[\n{ id: 'clients', domain: 'commercial', path: '/clients', router: createCrudRouter({ model:'client', entity:'client', permission:'clients.manage', schema:clientSchema }) },\n{ id: 'custom', domain: 'platform', path: '/custom', router: authzRoutes },\n];`,
    'backend/src/modules/custom/custom.routes.ts': `const router:any={}; router.use(requireTenant, requirePermission('custom.read')); router.get('/:id', (_q:any,r:any)=>r.status(200).json({ok:true,data:{},meta:{}})); export default router;`,
    'backend/src/modules/auth/auth.routes.ts': `const router:any={}; router.post('/login', validateBody(loginSchema), (_q:any,r:any)=>r.status(200).json({ok:true,data:{},meta:{}})); export default router;`,
    'backend/src/shared/observability/health.ts': `export function registerHealthRoutes(app:any){ app.get('/health/live',(_q:any,r:any)=>r.status(200).json({ok:true})); app.get('/health',(_q:any,r:any)=>r.status(200).json({ok:true})); }`,
    'backend/src/shared/http.ts': `export const ok=(res:any,data:any,meta={})=>res.status(200).json({ ok: true, data, meta });`,
    'backend/src/shared/middleware/error.ts': `return res.json(buildErrorEnvelope(normalized, context));`,
    'backend/src/shared/middleware/security.ts': `res.setHeader('x-request-id', id);`,
    'backend/src/shared/observability/contract.ts': `export const OBSERVABILITY_CONTRACT={ correlationHeader:'x-correlation-id' }; export const buildErrorEnvelope=()=>({ ok:false, type:'urn:problem', title:'Problem', status:400, detail:'detail', instance:'/x', code:'BAD_REQUEST', message:'detail', correlationId:'cid', requestId:'rid', details:{} });`,
    'backend/src/modules/crud.factory.ts': `const DEFAULT_LIST_TAKE=100; const MAX_LIST_TAKE=500; const MAX_LIST_SKIP=1_000_000;`,
    'backend/src/modules/schemas.ts': `export const clientSchema=z.object({name:z.string()}); export const loginSchema=z.object({email:z.string()});`,
  };
  const files = Object.keys(sources);
  const reader = { list:(prefix)=>files.filter((file)=>file.startsWith(prefix)), read:(file)=>sources[file], exists:(file)=>Object.hasOwn(sources,file) };
  const contract = buildApiContract(reader);
  const keys = contract.routes.map((item)=>`${item.method} ${item.path}`);
  assert.ok(keys.includes('POST /api/v1/auth/login'));
  assert.ok(keys.includes('GET /api/v1/clients'));
  assert.ok(keys.includes('PUT /api/v1/clients/:id'));
  assert.ok(keys.includes('GET /api/v1/custom/:id'));
  assert.ok(keys.includes('GET /health/live'));
  const custom = contract.routes.find((item)=>item.path==='/api/v1/custom/:id');
  assert.deepEqual(custom.auth, { tenantRequired:true, permissions:['custom.read'] });
  assert.equal(contract.conventions.pagination.takeMax, 500);
  assert.equal(contract.conventions.correlationHeader, 'x-correlation-id');
  assert.ok(contract.conventions.errorEnvelope.required.includes('detail'));
});

test('#652 is in the authoritative contracts consumed by #630 backend/full verification', async () => {
  const runner = await readFile(new URL('../scripts/local-verification-runner-v630.mjs', import.meta.url), 'utf8');
  const authoritative = await readFile(new URL('../scripts/run-authoritative-contracts.mjs', import.meta.url), 'utf8');
  assert.match(runner, /gate\('backend-tests','npm test'\)/);
  assert.match(authoritative, /tests\/api_contract_authority_v652\.test\.mjs/);
});
test('source-derived contract gate compares merge-base to current candidate', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const result = spawnSync(process.execPath, ['scripts/api-contract-authority-v652.mjs', '--check', '--base', 'main'], { cwd: root, encoding: 'utf8', shell: false, env: process.env });
  assert.equal(result.status, 0, `${result.stdout || ''}\n${result.stderr || ''}`);
  assert.match(result.stdout, /"schemaVersion":\s*652/);
  assert.match(result.stdout, /"candidateSha":\s*"[0-9a-f]{40}"/);
});
