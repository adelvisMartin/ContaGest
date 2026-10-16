import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const script = readFileSync(path.join('ops','backup','hipico-backup-postgres.sh'), 'utf8');
const inventory = readFileSync(path.join('ops','backup','hipico-public-tables.txt'), 'utf8')
  .split(/\r?\n/).map(v=>v.trim()).filter(v=>v && !v.startsWith('#'));

test('#842 backup scope is precisely the 25-table reviewed canonical inventory',()=>{
  assert.equal(inventory.length,25);
  assert.equal(new Set(inventory).size,25);
  assert.ok(inventory.every(t=>/^hipico_[a-z0-9_]+$/.test(t)));
  assert.match(script,/CANONICAL_TABLE_FILE=/);
  assert.match(script,/HIPICO_BACKUP_TABLE_FILE:-\$CANONICAL_TABLE_FILE/);
});

test('#842 rejects override mismatches before any database preflight or dump',()=>{
  const check = script.indexOf('provided_inventory_hash=');
  const compare = script.indexOf('provided_inventory_hash%%');
  const role = script.indexOf('node scripts/hipico-backup-role-verify-v24.mjs');
  const firstPsql = script.indexOf('psql "$HIPICO_BACKUP_DATABASE_URL"');
  const dump = script.indexOf('pg_dump "$HIPICO_BACKUP_DATABASE_URL"');
  assert.ok(check>=0 && compare>check && role>compare && firstPsql>compare && dump>compare);
  assert.match(script,/canonical_inventory_hash/);
  assert.match(script,/Backup inventory differs from the reviewed canonical 25-table scope/);
  assert.match(script,/HIPICO_CANDIDATE_SHA/);
});
