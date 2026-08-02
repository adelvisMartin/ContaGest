import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('no se publican credenciales genéricas en autenticación o RBAC', async () => {
  const sources = await Promise.all([
    read('backend/src/modules/auth/auth.routes.ts'),
    read('backend/src/modules/rbac/rbac.routes.ts'),
    read('frontend/src/services/accessControlService.js'),
    read('frontend/src/pages/AdminPanelPage.js')
  ]);
  assert.doesNotMatch(sources.join('\n'), /demo1234/i);
  assert.doesNotMatch(sources[2], /password:\s*['"]/i);
});

test('el acceso temporal y el bloqueo durable se validan en servidor', async () => {
  const [auth, context, schema] = await Promise.all([
    read('backend/src/modules/auth/auth.routes.ts'),
    read('backend/src/shared/middleware/context.ts'),
    read('backend/prisma/schema.prisma')
  ]);
  assert.match(auth, /LOGIN_FAILURE_LIMIT\s*=\s*5/);
  assert.match(auth, /prisma\.authLoginAttempt\.count/);
  assert.match(auth, /ensureAccessNotExpired/);
  assert.match(context, /accessExpiresAt/);
  assert.match(schema, /model AuthLoginAttempt/);
});

test('el frontend carga páginas bajo demanda y mantiene CSP sin eval', async () => {
  const [app, html, vercel] = await Promise.all([
    read('frontend/src/app.js'),
    read('frontend/index.html'),
    read('frontend/vercel.json')
  ]);
  assert.match(app, /import\.meta\.glob/);
  assert.match(app, /await resolvePage/);
  assert.doesNotMatch(html, /unsafe-eval|esm\.sh|unpkg\.com\/html5-qrcode|jspdf\.umd/i);
  assert.doesNotMatch(vercel, /unsafe-eval|unpkg\.com|esm\.sh/i);
});

test('las dependencias son reproducibles y bcryptjs no usa tipos obsoletos', async () => {
  const [root, frontend, backend, lock] = await Promise.all([
    read('package.json'),
    read('frontend/package.json'),
    read('backend/package.json'),
    read('package-lock.json')
  ]);
  assert.equal(JSON.parse(root).version, '11.12.0');
  assert.equal(JSON.parse(frontend).version, '11.12.0');
  assert.equal(JSON.parse(backend).version, '11.12.0');
  assert.doesNotMatch(root+frontend+backend, /"latest"/);
  assert.doesNotMatch(backend, /@types\/bcryptjs/);
  assert.equal(JSON.parse(lock).lockfileVersion, 3);
});
