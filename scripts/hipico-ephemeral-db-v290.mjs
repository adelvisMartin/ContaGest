import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const command = process.argv[2] || 'create';
const adminUrl = String(process.env.HIPICO_E2E_ADMIN_URL || '').trim();
const stateFile = path.resolve(process.env.HIPICO_E2E_STATE_FILE || 'artifacts/qa/hipico-v290/database-state.json');

function fail(message) {
  throw new Error(`[hipico-v290] ${message}`);
}

function assertEphemeralAdminUrl(value) {
  if (!value) fail('HIPICO_E2E_ADMIN_URL is required.');
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) fail(`Refusing non-local PostgreSQL host: ${host}`);
  if (!['/postgres', '/template1'].includes(url.pathname)) fail('Admin URL must point to postgres or template1, never an application database.');
  return url;
}

function safeRunToken(value) {
  return String(value || 'local').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'local';
}

function quoteIdentifier(value) {
  if (!/^hipico_e2e_[a-z0-9_]{8,63}$/.test(value)) fail(`Unsafe ephemeral database name: ${value}`);
  return `"${value}"`;
}

async function writeGithubEnv(name, value) {
  const file = process.env.GITHUB_ENV;
  if (file) await fs.appendFile(file, `${name}=${value}\n`, 'utf8');
}

async function writeState(state) {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function createDatabase() {
  const parsed = assertEphemeralAdminUrl(adminUrl);
  const run = safeRunToken(process.env.GITHUB_RUN_ID || process.env.HIPICO_E2E_RUN_ID || 'local');
  const attempt = safeRunToken(process.env.GITHUB_RUN_ATTEMPT || '1');
  const random = crypto.randomBytes(4).toString('hex');
  const databaseName = `hipico_e2e_${run}_${attempt}_${random}`.slice(0, 63);
  quoteIdentifier(databaseName);
  const state = {
    databaseName,
    host: parsed.hostname,
    port: parsed.port || '5432',
    status: 'planned',
    createdAt: null,
    runId: process.env.GITHUB_RUN_ID || process.env.HIPICO_E2E_RUN_ID || 'local'
  };
  await writeState(state);

  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } finally {
    await client.end();
  }

  state.status = 'created';
  state.createdAt = new Date().toISOString();
  await writeState(state);

  const databaseUrl = new URL(parsed.toString());
  databaseUrl.pathname = `/${databaseName}`;
  for (const [name, value] of [
    ['HIPICO_E2E_DATABASE_NAME', databaseName],
    ['HIPICO_E2E_DATABASE_URL', databaseUrl.toString()],
    ['DATABASE_URL', databaseUrl.toString()],
    ['DIRECT_DATABASE_URL', databaseUrl.toString()]
  ]) await writeGithubEnv(name, value);

  console.log(`[hipico-v290] created isolated database ${databaseName} on ${parsed.hostname}`);
}

async function dropDatabase() {
  const parsed = assertEphemeralAdminUrl(adminUrl);
  let databaseName = String(process.env.HIPICO_E2E_DATABASE_NAME || '').trim();
  if (!databaseName) {
    try {
      databaseName = String(JSON.parse(await fs.readFile(stateFile, 'utf8')).databaseName || '').trim();
    } catch {
      console.log('[hipico-v290] no ephemeral database state exists; nothing to clean');
      return;
    }
  }
  quoteIdentifier(databaseName);

  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [databaseName]);
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
  } finally {
    await client.end();
  }

  try {
    const saved = JSON.parse(await fs.readFile(stateFile, 'utf8'));
    await writeState({ ...saved, status: 'dropped', droppedAt: new Date().toISOString() });
  } catch {
    // Cleanup is already complete; missing/corrupt evidence should not recreate a database.
  }
  console.log(`[hipico-v290] dropped isolated database ${databaseName} from ${parsed.hostname}`);
}

if (command === 'create') await createDatabase();
else if (command === 'drop') await dropDatabase();
else fail(`Unknown command: ${command}`);
