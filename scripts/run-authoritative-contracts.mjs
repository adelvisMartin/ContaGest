#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const manifest=JSON.parse(fs.readFileSync('config/implementation-roadmap-1-58.json','utf8'));
const implementations=Array.isArray(manifest?.implementations)?manifest.implementations:[];
if(implementations.length!==58) throw new Error(`AUTHORITATIVE_IMPLEMENTATION_COUNT:${implementations.length}`);

const regressionPaths=[...new Set(implementations.flatMap((row)=>row.regressionPaths||[]))];
const required59=[
  'tests/implementations_1_58_audit.test.mjs',
  'tests/vercel_build_recovery_59_75.test.mjs',
  'tests/exact_sha_workflow_recovery_59_75.test.mjs',
  'tests/prisma_ephemeral_baseline_contract.test.mjs',
  'tests/security_audit_surface_boundary.test.mjs',
  'tests/authoritative_contract_suite_59_75.test.mjs',
  'tests/api_validation_error_59_75.test.mjs',
  'tests/rbac_authoritative_session_60_75.test.mjs'
];
const tests=[...new Set([...regressionPaths,...required59])];

for(const file of tests){
  if(!/^tests\/.+\.test\.mjs$/.test(file)) throw new Error(`INVALID_AUTHORITATIVE_TEST_PATH:${file}`);
  if(/^tests\/v11_/i.test(file)) throw new Error(`SUPERSEDED_VERSION_TEST_IN_AUTHORITY:${file}`);
  if(!fs.existsSync(file)) throw new Error(`MISSING_AUTHORITATIVE_TEST:${file}`);
}

console.log(`[authoritative-contracts] implementations=${implementations.length} tests=${tests.length}`);
const result=spawnSync(process.execPath,['--test',...tests],{stdio:'inherit',env:process.env,shell:false});
if(result.error) throw result.error;
process.exitCode=result.status??1;
