#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const contractFiles = [
  'tests/migration_chain_v626_contract.test.mjs',
  'tests/release_readiness_v627_contract.test.mjs',
  'tests/fiscal_rule_authority_v629.test.mjs',
  'tests/canonical_database_gate_v632_contract.test.mjs',
  'tests/production_database_drift_v625.test.mjs',
  'tests/financial_exactness_v6775.test.mjs',
  'tests/financial_authority_v2.test.mjs',
  'tests/financial_authority_v3.test.mjs',
  'tests/financial_reliability_v6775.test.mjs',
  'tests/financial_reporting_modules.test.mjs',
  'tests/frontend_financial_reliability_v2.test.mjs',
  'tests/accounting_reports_query_helper_v2.test.mjs',
  'tests/backend_contract_fix_v2.test.mjs',
  'tests/frontend_api_migration_v39.test.mjs',
  'tests/dashboard_endpoint_v40.test.mjs',
  'tests/accessibility_semantics_v43.test.mjs',
  'tests/tokens_css_v31.test.mjs',
  'tests/design_token_authority_v631.test.mjs',
  'tests/responsive_overrides_v28.test.mjs',
  'tests/ui_visual_gate_v46.test.mjs',
  'tests/component_library_v619_contract.test.mjs',
  'tests/component_library_v619_audit.test.mjs',
  'tests/forms_interaction_v620_contract.test.mjs',
  'tests/enterprise_data_ui_v621_contract.test.mjs',
  'tests/deep_view_theming_v37.test.mjs',
  'tests/mui_island_v65.test.mjs',
  'tests/calendar_picker_contract_v64.test.mjs',
  'tests/appointment_agenda_dnd_v75.test.mjs',
  'tests/extra_modules_ux_v42.test.mjs',
  'tests/generic_crud_factory_v55.test.mjs',
  'tests/architecture_boundary_v80.test.mjs',
  'tests/clean_code_refactor_authority_v622_contract.test.mjs',
  'tests/agent_system_v623_contract.test.mjs',
  'tests/importmap_role_consistency_v2.test.mjs',
  'tests/database_authority_v6775.test.mjs',
  'tests/database_security_authority_v57.test.mjs',
  'tests/relational_normalization_v633_contract.test.mjs',
  'tests/composite_tenant_integrity_v634.test.mjs',
  'tests/form_submit_isolation_v53.test.mjs',
  'tests/tenant_reliability_v6782.test.mjs',
  'tests/frontend_parallelism_v6779.test.mjs',
  'tests/api_contract_v56.test.mjs',
  'tests/route_matrix_v6786.test.mjs',
  'tests/react_mui_parity_v6783.test.mjs',
  'tests/ld_feature_v85.test.mjs',
  'tests/issue_91_ledger_lifecycle_contract.test.mjs',
  'tests/ledger_lifecycle_628_hardening.test.mjs',
];

const args = process.argv.slice(2);
const run = spawnSync(
  process.execPath,
  ['--test', ...contractFiles, ...args],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
  }
);

if (run.error) {
  console.error(run.error.message);
  process.exit(1);
}

process.exit(run.status ?? 1);
