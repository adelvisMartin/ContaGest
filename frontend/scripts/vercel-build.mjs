import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// DIAGNOSTIC-ONLY: isolate the first failing authoritative contract file.
// Exit 20 + test index. Never merge this file.
const manifest = JSON.parse(fs.readFileSync('../config/implementation-roadmap-1-58.json','utf8'));
const implementations = Array.isArray(manifest?.implementations) ? manifest.implementations : [];
const regressionPaths = [...new Set(implementations.flatMap((row) => row.regressionPaths || []))];
const required59 = [
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
  'tests/raw_sql_security_68_75.test.mjs',
  'tests/design_system_authority_69_75.test.mjs',
  'tests/vertical_asset_system_70_75.test.mjs',
  'tests/cloudflare_security_audit_skill_contract.test.mjs'
];
const tests = [...new Set([...regressionPaths, ...required59])];

for (let index = 0; index < tests.length; index += 1) {
  const result = spawnSync(process.execPath, ['--test', tests[index]], {
    cwd: '..',
    stdio: 'inherit',
    env: process.env,
    shell: false
  });
  if (result.error || result.status !== 0) {
    process.exitCode = 20 + index;
    break;
  }
}
