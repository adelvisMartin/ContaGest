import assert from 'node:assert/strict';
import test from 'node:test';

const dbEnvKeys = [
  'DATABASE_RUNTIME_URL',
  'DATABASE_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL',
  'SUPABASE_DB_URL',
  'DIRECT_DATABASE_URL',
  'DIRECT_URL',
  'POSTGRES_URL_NON_POOLING'
] as const;

const testJwtSecret = `captcha-ci-jwt-${'x'.repeat(40)}`;
const testLicenseHashSecret = `license-ci-hash-${'x'.repeat(40)}`;

test('GET /api/v1/auth/captcha boots the full app without weakening the DB runtime guard', async (t) => {
  const originalEnv = new Map<string, string | undefined>();
  for (const key of [...dbEnvKeys, 'NODE_ENV', 'VERCEL_ENV', 'JWT_SECRET', 'LICENSE_HASH_SECRET']) {
    originalEnv.set(key, process.env[key]);
  }

  process.env.NODE_ENV = 'production';
  process.env.VERCEL_ENV = 'production';
  process.env.JWT_SECRET = testJwtSecret;
  process.env.LICENSE_HASH_SECRET = testLicenseHashSecret;
  for (const key of dbEnvKeys) process.env[key] = '';

  t.after(() => {
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  // Import the same full application graph used by the serverless entrypoint. This
  // intentionally catches unrelated top-level dependencies that could otherwise
  // crash the Lambda before the stateless CAPTCHA handler is reached.
  const { createApp } = await import('../../app.js');
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/captcha`);
  assert.equal(response.status, 200);

  const body = await response.json() as any;
  assert.equal(body?.ok, true);
  assert.equal(body?.data?.kind, 'math');
  assert.equal(typeof body?.data?.question, 'string');
  assert.equal(typeof body?.data?.prompt, 'string');
  assert.equal(typeof body?.data?.token, 'string');
  assert.equal(body.data.token.split('.').length, 2);
  assert.ok(Number(body?.data?.expiresAt) > Date.now());

  // The bootstrap fix must not turn DB access into a bypass: a DB-backed route
  // still fails closed until the dedicated runtime URL exists and passes policy.
  const { prisma } = await import('../../database/prisma.js');
  assert.throws(
    () => void prisma.tenant,
    /Falta una URL PostgreSQL runtime/
  );

  process.env.DATABASE_RUNTIME_URL = 'postgresql://postgres:secret@example.pooler.supabase.com:6543/postgres';
  assert.throws(
    () => void prisma.tenant,
    /rol privilegiado "postgres"/
  );
});
