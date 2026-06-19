import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const mask = (value = '') => value
  .replace(/postgresql:\/\/postgres(?:\.[^:]+)?:([^@]+)@/, (m) => m.replace(/:([^@]+)@/, ':***@'));

async function testConnection(label, connectionString) {
  if (!connectionString) {
    console.error(`Falta ${label} en backend/.env`);
    return false;
  }
  console.log(`${label}: ${mask(connectionString)}`);
  const client = new Client({
    connectionString,
    ssl: connectionString.includes('supabase.co') || connectionString.includes('pooler.supabase.com')
      ? { rejectUnauthorized: false }
      : undefined,
    connectionTimeoutMillis: 30000
  });

  try {
    await client.connect();
    const result = await client.query('select now() as now, current_database() as db, current_schema() as schema');
    console.log(`${label} OK:`, result.rows[0]);
    return true;
  } catch (error) {
    console.error(`${label} FALLÓ: ${error.message}`);
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

console.log('ContaGest-VE DB Doctor v8.9');
console.log('---------------------------');

const appOk = await testConnection('DATABASE_URL runtime', process.env.DATABASE_URL);
const directOk = await testConnection('DIRECT_DATABASE_URL migrations', process.env.DIRECT_DATABASE_URL);

console.log('');
if (!appOk) {
  console.error('El backend NO puede leer/escribir. Corrige DATABASE_URL.');
  console.error('Para Supabase usa transaction pooler 6543 en DATABASE_URL:');
  console.error('postgresql://postgres.PROJECT_REF:PASSWORD@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&connection_limit=5&pool_timeout=60&schema=public');
  process.exitCode = 1;
} else {
  console.log('Runtime OK. El backend puede atender el frontend.');
  if (!directOk) {
    console.warn('Advertencia: DIRECT_DATABASE_URL falló. Las migraciones Prisma pueden fallar, pero el runtime puede funcionar si ya creaste tablas por SQL Editor.');
  }
}
