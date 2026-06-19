import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const sqlPath = path.resolve('supabase/migrations/0002_rls_policies.sql');
const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Falta DATABASE_URL o DIRECT_DATABASE_URL en backend/.env');
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const client = new Client({ connectionString, ssl: connectionString.includes('supabase.co') ? { rejectUnauthorized: false } : undefined });

try {
  await client.connect();
  await client.query(sql);
  console.log('RLS y políticas aplicadas correctamente.');
} catch (error) {
  console.error('No se pudieron aplicar las políticas RLS:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
