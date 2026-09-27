import { spawnSync } from 'node:child_process';

// DIAGNOSTIC-ONLY: isolate the first failing command inside frontend preqa:source.
// Exit 101..113 maps one-to-one to the ordered checks below. Never merge this file.
const checks = Object.freeze([
  { id:'baseline-verify', command:'npm', args:['run','baseline:verify'] },
  { id:'erp-wave-a', command:'npm', args:['run','audit:erp-ui-wave-a'] },
  { id:'contracts-current', command:'npm', args:['run','test:contracts:current'] },
  { id:'source-contract-pack', command:'node', args:['--test','tests/marketing_seo_issue_25.test.mjs','tests/reproducible_install_contract.test.mjs','tests/preview_secret_fail_closed.test.mjs','tests/erp_performance_issue_157.test.mjs','tests/erp_performance_execution_issue_157.test.mjs','tests/erp157_finalizer_truth_issue_157.test.mjs','tests/erp157_fixture_provenance_issue_157.test.mjs','tests/erp157_budget_ratification_issue_157.test.mjs','tests/hipico_command_center_289_contract.test.mjs'] },
  { id:'hipico-root-contracts', command:'node', args:['scripts/hipico-root-contracts.mjs'] },
  { id:'bridge-runtime-utils', command:'node', args:['--test','tools/hipico-whatsapp-web-bridge/tests/runtime-utils.test.mjs'] },
  { id:'syntax-pack', command:'node', args:['--check','scripts/hipico-exact-sha-gate.mjs'] },
  { id:'backend-typecheck', command:'npm', args:['--workspace','backend','run','typecheck'] },
  { id:'backend-config-tests', command:'npm', args:['--workspace','backend','run','test:config'] },
  { id:'backend-hipico-tests', command:'npm', args:['--workspace','backend','run','test:hipico'] },
  { id:'visual-source-gate', command:'node', args:['scripts/visual-source-gate-v16.mjs'] },
  { id:'functional-source-gate', command:'node', args:['scripts/erp-functional-source-gate-v16.mjs'] },
  { id:'ui-control-audit', command:'node', args:['scripts/ui-control-audit-v16.mjs'] }
]);

for (let index = 0; index < checks.length; index += 1) {
  const check = checks[index];
  const result = spawnSync(check.command, check.args, {
    cwd: '..',
    stdio: 'inherit',
    env: process.env,
    shell: false
  });
  if (result.error || result.status !== 0) {
    process.exitCode = 101 + index;
    break;
  }
}
