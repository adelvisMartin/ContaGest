import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const backendRoot=path.resolve(scriptDir,'..');
const policyPaths=[
  path.join(backendRoot,'supabase/migrations/0002_rls_policies.sql'),
  path.join(backendRoot,'supabase/migrations/0003_rls_grants_security_definer_hardening.sql'),
  path.join(backendRoot,'supabase/migrations/0004_backend_only_browser_grants_hardening.sql'),
];
const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
const forbiddenPolicyDdlRoles=new Set(['contagest_runtime','anon','authenticated','service_role']);

if (!connectionString) {
  console.error('Falta DATABASE_URL o DIRECT_DATABASE_URL en backend/.env');
  process.exit(1);
}

const client = new Client({ connectionString, ssl: connectionString.includes('supabase.co') ? { rejectUnauthorized: false } : undefined });

try {
  await client.connect();
  const { rows:[authority] }=await client.query(`
    SELECT current_user AS "currentUser",
           has_schema_privilege(current_user,'public','CREATE') AS "canCreatePublic"
  `);
  const currentUser=String(authority?.currentUser||'');
  if(!currentUser||forbiddenPolicyDdlRoles.has(currentUser)||!authority?.canCreatePublic){
    throw new Error(`POLICY_DDL_AUTHORITY_REQUIRED:${currentUser||'UNKNOWN'}`);
  }

  await client.query('BEGIN');
  for(const sqlPath of policyPaths){
    const sql=fs.readFileSync(sqlPath,'utf8');
    await client.query(sql);
    console.log(`Policy SQL aplicado: ${path.basename(sqlPath)}`);
  }
  await client.query('COMMIT');
  console.log('RLS, grants y SECURITY DEFINER aplicados correctamente.');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('No se pudieron aplicar las políticas RLS:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
