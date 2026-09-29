import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isLoopbackDatabaseUrl,
  validateBenchmarkConfig,
  parseExplainJson,
  comparePlans,
} from '../scripts/postgres-performance-v644.mjs';

const config=JSON.parse(readFileSync(new URL('../config/postgres-performance-v644.json',import.meta.url),'utf8'));

test('v644 contract accepts canonical read-only journeys',()=>assert.equal(validateBenchmarkConfig(config),true));
test('v644 refuses non-local databases',()=>{
  assert.equal(isLoopbackDatabaseUrl('postgresql://u:p@localhost:5432/db'),true);
  assert.equal(isLoopbackDatabaseUrl('postgresql://u:p@db.example.com:5432/db'),false);
});
test('v644 rejects mutating benchmark SQL',()=>assert.throws(()=>validateBenchmarkConfig({...config,journeys:[...config.journeys.slice(0,2),{id:'bad',table:'Client',sql:'DELETE FROM "Client"'}]}),/SELECT_ONLY/));
test('v644 parses explain json and compares evidence',()=>{
  const plan=parseExplainJson(JSON.stringify([{Plan:{'Node Type':'Index Scan','Index Name':'Client_tenantId_name_idx','Actual Rows':12,'Plan Rows':10,'Shared Hit Blocks':8,'Shared Read Blocks':2},'Planning Time':0.2,'Execution Time':1.5}]));
  assert.deepEqual(plan.indexes,['Client_tenantId_name_idx']);
  assert.equal(comparePlans(plan,{...plan,executionTimeMs:1,sharedReadBlocks:1}).evidence,'IMPROVED');
});
