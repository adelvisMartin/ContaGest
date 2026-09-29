import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read=(file)=>fs.readFileSync(file,'utf8');

test('#621 data query contracts keep pagination modes explicit and serialization deterministic',async()=>{
  const mod=await import('../frontend/src/components/vnext/dataContracts.js');
  assert.deepEqual(mod.normalizePageQuery({page:2,pageSize:50}),{mode:'page',page:2,pageSize:50});
  assert.deepEqual(mod.normalizeCursorQuery({cursor:'next-001',pageSize:25}),{mode:'cursor',cursor:'next-001',pageSize:25});
  assert.deepEqual(mod.normalizeSortModel([{field:'createdAt',direction:'desc'}]),[{field:'createdAt',direction:'desc'}]);
  assert.deepEqual(mod.normalizeFilterModel([{field:'status',operator:'eq',value:'00123'}]),[{field:'status',operator:'eq',value:'00123'}]);
  assert.equal(mod.serializeDataQuery({pagination:{mode:'page',page:3,pageSize:20},sort:[{field:'name',direction:'asc'}],filters:[{field:'status',operator:'eq',value:'open'}],search:'  abc  '}),'mode=page&page=3&pageSize=20&sort=name%3Aasc&filter=status%3Aeq%3Aopen&search=abc');
  assert.throws(()=>mod.normalizePageQuery({page:1,pageSize:5000}),/pageSize/);
});

test('#621 canonical data primitives are exported without commercial or direct MUI X authority',()=>{
  const barrel=read('frontend/src/components/vnext/index.js');
  for(const name of ['CgTable','CgDataGrid','CgPagination','CgSkeleton','CgInlineError','CgRetryState','CgNoResults','CgDetailList','CgKpi','CgMetricGrid','CgStatusSummary','CgToolbar','CgCommandBar','CgSearchField']) assert.match(barrel,new RegExp(`export \\{[^}]*${name}`,'s'));
  const data=read('frontend/src/components/vnext/data.js');
  assert.doesNotMatch(data,/@mui\/x-data-grid-pro|@mui\/x-data-grid-premium/);
  assert.match(data,/scope:'col'/);
  assert.match(data,/no-results|noResults/i);
  assert.match(data,/TablePagination/);
});

test('#621 pilots consume canonical data rendering without changing service authority',()=>{
  const audit=read('frontend/src/pages/AuditPage.js');
  const approvals=read('frontend/src/pages/ApprovalsPage.js');
  assert.doesNotMatch(audit,/\bErpDataTable\b/);
  assert.match(audit,/CgLegacyTable/);
  assert.doesNotMatch(approvals,/<table>|<thead>|<tbody>/);
  assert.match(approvals,/CgLegacyTable/);
  for(const call of ['ApprovalsService.inbox()','ApprovalsService.mine()','ApprovalsService.report()','ApprovalsService.approve(','ApprovalsService.reject(']) assert.ok(approvals.includes(call),call);
});

test('#621 architecture explicitly avoids MUI X until measured need exists',()=>{
  const design=read('docs/superpowers/specs/2026-09-29-issue-621-enterprise-data-ui-design.md');
  assert.match(design,/no MUI X dependency required/i);
  assert.match(design,/AuditPage/);
  assert.match(design,/ApprovalsPage/);
  const ledger=JSON.parse(read('docs/architecture/enterprise-data-ui-v1.json'));
  assert.equal(ledger.rules.commercialMuiX,false);
  assert.equal(ledger.performance.newRuntimeDependencies,0);
  assert.equal(ledger.pilots.length,2);
});

test('#621 authority audit and authoritative runner are wired',()=>{
  const result=spawnSync(process.execPath,['scripts/enterprise-data-ui-authority-audit-v621.mjs'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  const report=JSON.parse(result.stdout.trim());
  assert.equal(report.ok,true);
  assert.deepEqual(report.pilots,['AuditPage','ApprovalsPage']);
  const runner=read('scripts/run-authoritative-contracts.mjs');
  assert.match(runner,/enterprise_data_ui_issue_621\.test\.mjs/);
});
