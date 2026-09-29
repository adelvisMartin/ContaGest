#!/usr/bin/env node
import process from 'node:process';
import { Client } from 'pg';
import { LEDGER_RECONCILIATION_SQL, assertReadOnlySql, normalizeClassifications } from './ledger-lifecycle/reconcile.mjs';
const url=process.env.DATABASE_URL;
if(!url) throw new Error('DATABASE_URL_REQUIRED');
assertReadOnlySql(LEDGER_RECONCILIATION_SQL);
const client=new Client({connectionString:url,ssl:url.includes('supabase')?{rejectUnauthorized:false}:undefined});
await client.connect();
try{
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout='30s'");
  const result=await client.query(LEDGER_RECONCILIATION_SQL);
  await client.query('ROLLBACK');
  console.log(JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),repoSha:process.env.GITHUB_SHA||process.env.REPO_SHA||null,classifications:normalizeClassifications(result.rows[0]?.classifications)},null,2));
}catch(error){try{await client.query('ROLLBACK')}catch{} throw error}finally{await client.end()}
