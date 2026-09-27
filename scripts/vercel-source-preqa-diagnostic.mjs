#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { runHipicoRootContracts } from './hipico-root-contracts.mjs';

// DIAGNOSTIC ONLY. Mirrors frontend preqa:source one command at a time.
// Exit 101..127 identifies the first failing source command. Exit 130..250
// identifies the failing isolated Hípico root-contract file without weakening a gate.
const checks = Object.freeze([
  ['baseline-verify','npm',['run','baseline:verify']],
  ['erp-wave-a','npm',['run','audit:erp-ui-wave-a']],
  ['contracts-current','npm',['run','test:contracts:current']],
  ['source-contract-pack','node',['--test','tests/marketing_seo_issue_25.test.mjs','tests/reproducible_install_contract.test.mjs','tests/preview_secret_fail_closed.test.mjs','tests/erp_performance_issue_157.test.mjs','tests/erp_performance_execution_issue_157.test.mjs','tests/erp157_finalizer_truth_issue_157.test.mjs','tests/erp157_fixture_provenance_issue_157.test.mjs','tests/erp157_budget_ratification_issue_157.test.mjs','tests/hipico_command_center_289_contract.test.mjs']],
  ['hipico-root-contracts',null,[]],
  ['bridge-runtime-utils','node',['--test','tools/hipico-whatsapp-web-bridge/tests/runtime-utils.test.mjs']],
  ['check-exact-sha','node',['--check','scripts/hipico-exact-sha-gate.mjs']],
  ['check-browser-qa','node',['--check','scripts/hipico-browser-qa.mjs']],
  ['check-root-contracts','node',['--check','scripts/hipico-root-contracts.mjs']],
  ['check-write-build-info','node',['--check','frontend/scripts/write-hipico-build-info.mjs']],
  ['check-group-identity','node',['--check','tools/hipico-whatsapp-bridge/src/group-identity.mjs']],
  ['check-wa-index','node',['--check','tools/hipico-whatsapp-bridge/src/index.mjs']],
  ['check-wa-web-utils','node',['--check','tools/hipico-whatsapp-web-bridge/src/runtime-utils.mjs']],
  ['check-hipico-app','node',['--check','frontend/public/hipico-control/assets/js/app.js']],
  ['check-hipico-store','node',['--check','frontend/public/hipico-control/assets/js/store.js']],
  ['check-hipico-store-v2','node',['--check','frontend/public/hipico-control/assets/js/store-v2.js']],
  ['check-hipico-sync','node',['--check','frontend/public/hipico-control/assets/js/sync.js']],
  ['check-hipico-sw','node',['--check','frontend/public/hipico-control/sw.js']],
  ['check-api-shared','node',['--check','frontend/api/hipico/_shared.js']],
  ['check-api-status','node',['--check','frontend/api/hipico/status.js']],
  ['check-api-command-center','node',['--check','frontend/api/hipico/command-center.js']],
  ['backend-typecheck','npm',['--workspace','backend','run','typecheck']],
  ['backend-config','npm',['--workspace','backend','run','test:config']],
  ['backend-hipico','npm',['--workspace','backend','run','test:hipico']],
  ['visual-source','node',['scripts/visual-source-gate-v16.mjs']],
  ['functional-source','node',['scripts/erp-functional-source-gate-v16.mjs']],
  ['ui-control-audit','node',['scripts/ui-control-audit-v16.mjs']]
]);

for (let index = 0; index < checks.length; index += 1) {
  const [id, command, args] = checks[index];
  console.log(`[vercel-source-diagnostic][START] ${id}`);
  const result = id === 'hipico-root-contracts'
    ? { error:null, status:runHipicoRootContracts(), signal:null }
    : spawnSync(command, args, { cwd:'..', stdio:'inherit', env:process.env, shell:false });
  if (result.error || result.status !== 0) {
    console.error(`[vercel-source-diagnostic][FAIL] ${id} exit=${result.status ?? 'null'} signal=${result.signal||'none'}`);
    const nestedHipicoExit = id === 'hipico-root-contracts'
      && Number.isInteger(result.status)
      && result.status >= 130
      && result.status <= 250;
    process.exitCode = nestedHipicoExit ? result.status : 101 + index;
    break;
  }
}
