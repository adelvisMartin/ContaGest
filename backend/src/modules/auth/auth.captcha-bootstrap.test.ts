import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
const backendRoot = fileURLToPath(new URL('../../../', import.meta.url));

function runFreshProductionBootstrap() {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
    JWT_SECRET: testJwtSecret,
    LICENSE_HASH_SECRET: testLicenseHashSecret
  };
  for (const key of dbEnvKeys) delete childEnv[key];

  const source = String.raw`
    import assert from 'node:assert/strict';
    import { createApp } from './src/app.ts';
    import { prisma } from './src/database/prisma.ts';

    const app = createApp();
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    try {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const response = await fetch('http://127.0.0.1:' + address.port + '/api/v1/auth/captcha');
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(body?.ok, true);
      assert.equal(body?.data?.kind, 'math');
      assert.equal(typeof body?.data?.question, 'string');
      assert.equal(typeof body?.data?.prompt, 'string');
      assert.equal(typeof body?.data?.token, 'string');
      assert.equal(body.data.token.split('.').length, 2);
      assert.ok(Number(body?.data?.expiresAt) > Date.now());

      assert.throws(
        () => void prisma.tenant,
        /Falta una URL PostgreSQL runtime/
      );

      process.env.DATABASE_RUNTIME_URL = 'postgresql://postgres:secret@example.pooler.supabase.com:6543/postgres';
      assert.throws(
        () => void prisma.tenant,
        /rol privilegiado "postgres"/
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  `;

  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '--eval', source],
      { cwd: backendRoot, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`fresh CAPTCHA bootstrap exited ${code ?? signal}\n${stdout}\n${stderr}`));
    });
  });
}

test('GET /api/v1/auth/captcha boots the full app without weakening the DB runtime guard', async () => {
  // The contract is specifically about a cold serverless bootstrap. Run it in a
  // fresh process so module-level environment parsing cannot inherit state from
  // another test loaded by the Node test runner.
  const result = await runFreshProductionBootstrap();
  assert.equal(result.stderr, '');
});
