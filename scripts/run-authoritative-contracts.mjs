#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const CONTRACT_CONCURRENCY=1;
const CONTRACT_BATCH_SIZE=1;
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
  'tests/rbac_authoritative_session_60_75.test.mjs',
  'tests/full_58_route_anti_overlap_61_75.test.mjs',
  'tests/playwright_determinism_62_75.test.mjs',
  'tests/cross_browser_critical_matrix_63_75.test.mjs',
  'tests/health_dentistry_bounded_contexts_66_75.test.mjs',
  'tests/vertical_schema_authority_67_75.test.mjs',
  'tests/database_authority_67_75.test.mjs',
  'tests/database_production_drift_625.test.mjs',
  'tests/raw_sql_security_68_75.test.mjs',
  'tests/design_system_authority_69_75.test.mjs',
  'tests/design_token_authority_issue_631.test.mjs',
  'tests/component_library_vnext_issue_619.test.mjs',
  'tests/forms_interaction_issue_620.test.mjs',
  'tests/enterprise_data_ui_issue_621.test.mjs',
  'tests/clean_code_refactor_authority_issue_622.test.mjs',
  'tests/agent_system_v3_issue_623.test.mjs',
  'tests/access_license_policy_issue_698.test.mjs',
  'tests/react_strangler_migration_issue_639.test.mjs',
  'tests/full_route_browser_matrix_issue_640.test.mjs',
  'tests/theme_state_accessibility_issue_645.test.mjs',
  'tests/auth_boundary_issue_636.test.mjs',
  'tests/vertical_asset_system_70_75.test.mjs',
  'tests/cloudflare_security_audit_skill_contract.test.mjs',
  'tests/fiscal_authority_v561_contract.test.mjs',
  'tests/fiscal_single_source_v629_contract.test.mjs',
  'tests/local_verification_runner_v630.test.mjs',
  'tests/production_convergence_v627.test.mjs',
  'tests/relational_normalization_audit_v633.test.mjs',
  'tests/budgetwallet_fk_indexes_v684.test.mjs',
  'tests/implicit_relation_fk_hardening_v683.test.mjs',
  'tests/composite_tenant_integrity_v634.test.mjs',
  'tests/tenant_isolation_adversarial_issue_641.test.mjs',
  'tests/db_security_hardening_v635.test.mjs',
  'tests/db_security_audit_v635.test.mjs',
];
const tests=[...new Set([...regressionPaths,...required59])];

for(const file of tests){
  if(!/^tests\/.+\.test\.mjs$/.test(file)) throw new Error(`INVALID_AUTHORITATIVE_TEST_PATH:${file}`);
  if(/^tests\/v11_/i.test(file)) throw new Error(`SUPERSEDED_VERSION_TEST_IN_AUTHORITY:${file}`);
  if(!fs.existsSync(file)) throw new Error(`MISSING_AUTHORITATIVE_TEST:${file}`);
}

console.log(`[authoritative-contracts] implementations=${implementations.length} tests=${tests.length} concurrency=${CONTRACT_CONCURRENCY} batchSize=${CONTRACT_BATCH_SIZE}`);
for(let offset=0;offset<tests.length;offset+=CONTRACT_BATCH_SIZE){
  const batch=tests.slice(offset,offset+CONTRACT_BATCH_SIZE);
  console.log(`[authoritative-contracts] batch=${Math.floor(offset/CONTRACT_BATCH_SIZE)+1} files=${batch.length}`);
  const result=spawnSync(process.execPath,['--test',`--test-concurrency=${CONTRACT_CONCURRENCY}`,...batch],{stdio:'inherit',env:process.env,shell:false});
  if(result.error) throw result.error;
  if(result.status!==0){
    process.exitCode=result.status??1;
    break;
  }
}
