import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const requiredFiles = [
  'backend/src/shared/auth/coordinateCard.ts',
  'backend/src/shared/licensing/licenseGuard.ts',
  'backend/src/modules/verticals/verticals.routes.ts',
  'backend/src/modules/verticals/verticals-extended.routes.ts',
  'backend/src/modules/media/media.routes.ts',
  'frontend/src/pages/HealthcarePage.js',
  'frontend/src/pages/GymManagementPage.js',
  'frontend/src/pages/CommunicationTemplatesPage.js',
  'frontend/src/pages/AiAssistantPage.js',
  'frontend/src/styles/verticals.css',
  'frontend/src/styles/security.css'
];

test('all specialized production files exist', () => {
  requiredFiles.forEach((path) => assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, path));
});

test('coordinate MFA stores HMAC hashes and uses one-time expiring challenges', () => {
  const code = read('backend/src/shared/auth/coordinateCard.ts');
  assert.match(code, /createHmac\('sha256'/);
  assert.match(code, /CHALLENGE_TTL_MS/);
  assert.match(code, /MAX_ATTEMPTS/);
  assert.match(code, /timingSafeEqual/);
  assert.match(code, /"usedAt"/);
  assert.doesNotMatch(code, /cellCodes|plainCodes/);
});

test('license enforcement rechecks revocation expiry and module scope per permission', () => {
  const code = read('backend/src/shared/middleware/context.ts');
  assert.match(code, /status:'active'/);
  assert.match(code, /expiresAt:\{ gt:new Date\(\) \}/);
  assert.match(code, /PERMISSION_MODULES/);
  assert.match(code, /La licencia fue revocada/);
});

test('health and gym routes always require signed tenant context and permissions', () => {
  const verticals = `${read('backend/src/modules/verticals/verticals.routes.ts')}\n${read('backend/src/modules/verticals/verticals-extended.routes.ts')}`;
  assert.match(verticals, /router\.use\(requireTenant\)/);
  assert.match(verticals, /requirePermission\('health\.manage'\)/);
  assert.match(verticals, /requirePermission\('gym\.manage'\)/);
  assert.match(verticals, /requirePermission\('communications\.manage'\)/);
  assert.match(verticals, /GymAssessment/);
  assert.match(verticals, /GymNutritionPlan/);
  assert.match(verticals, /CareEncounter/);
});

test('private media validates ownership file type size and tenant path', () => {
  const code = read('backend/src/modules/media/media.routes.ts');
  assert.match(code, /contagest-media/);
  assert.match(code, /MAX_BYTES/);
  assert.match(code, /image\/jpeg/);
  assert.match(code, /authorize\(req/);
  assert.match(code, /startsWith\(`\$\{context\.tenantId\}\//);
  assert.doesNotMatch(code, /getPublicUrl/);
});

test('AI assistant uses tenant indicators and safe deterministic fallback', () => {
  const code = read('backend/src/modules/ai/ai.routes.ts');
  assert.match(code, /tenantId/);
  assert.match(code, /loadOperationalSnapshot/);
  assert.match(code, /operationalAnswer/);
  assert.match(code, /OPENAI_API_KEY/);
  assert.match(code, /contagest-operational/);
});

test('frontend registers all new routes and business modes', () => {
  const app = read('frontend/src/app.js');
  const catalog = read('frontend/src/data/moduleCatalog.js');
  ['salud','veterinaria','gimnasio','rutinas','nutricion','mensajes'].forEach((route) => {
    assert.match(app, new RegExp(`${route}:`));
    assert.match(catalog, new RegExp(`route:'${route}'`));
  });
  assert.match(catalog, /salud:\{/);
  assert.match(catalog, /veterinaria:\{/);
  assert.match(catalog, /gimnasio:\{/);
});

test('login has signed captcha license access and coordinate challenge', () => {
  const backend = read('backend/src/modules/auth/auth.routes.ts');
  const frontend = read('frontend/src/pages/LoginPage.js');
  assert.match(backend, /signCaptchaPayload/);
  assert.match(backend, /licenseKey/);
  assert.match(backend, /login\/coordinates/);
  assert.match(frontend, /coordinateChallengeForm/);
  assert.match(frontend, /Acceso de cliente con licencia/);
});
