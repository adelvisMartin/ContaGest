import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read=(file)=>fs.readFileSync(file,'utf8');

test('#620 pure form contracts preserve backend metadata and canonical date/time strings',async()=>{
  const mod=await import('../frontend/src/components/vnext/formContracts.js');
  assert.deepEqual(mod.normalizeUiError({status:422,response:{data:{message:'Inválido',code:'VALIDATION',field:'email',correlationId:'c-1'}}}),{message:'Inválido',code:'VALIDATION',field:'email',correlationId:'c-1',status:422,scope:'field'});
  assert.equal(mod.normalizeOptionalFormValue('',{emptyAs:null}),null);
  assert.equal(mod.normalizeOptionalFormValue('',{emptyAs:'absent'}),undefined);
  assert.equal(mod.normalizeOptionalFormValue('00123'),'00123');
  assert.equal(mod.normalizeDateValue('2026-09-29T20:30:00Z'),'2026-09-29');
  assert.equal(mod.normalizeTimeValue('07:05:59'),'07:05');
  assert.deepEqual(mod.serializeDateRange({from:'2026-09-01',to:'2026-09-29'}),{from:'2026-09-01',to:'2026-09-29'});
});

test('#620 canonical form controls are exported without a new date framework or barrel cycle',()=>{
  const forms=read('frontend/src/components/vnext/forms.js');
  const barrel=read('frontend/src/components/vnext/index.js');
  for(const name of ['CgFormField','CgSelect','CgAutocomplete','CgCombobox','CgCheckbox','CgRadioGroup','CgSwitch','CgDatePicker','CgDateRange','CgTimeField']) assert.match(barrel,new RegExp(`export \\{[^}]*${name}`,'s'));
  assert.doesNotMatch(forms,/@mui\/x-date-pickers|dayjs|date-fns|moment/);
  assert.doesNotMatch(forms,/from '\.\/index\.js'/);
  assert.match(forms,/aria-describedby/);
  assert.match(forms,/loading/);
});

test('#620 overlays and filters have one canonical owner and safe saving semantics',()=>{
  const overlays=read('frontend/src/components/vnext/overlays.js');
  const filters=read('frontend/src/components/vnext/filters.js');
  const barrel=read('frontend/src/components/vnext/index.js');
  for(const name of ['CgDialog','CgConfirmDialog','CgDrawer','CgPopover','CgMenu','CgFilterBar','CgFilterChip']) assert.match(barrel,new RegExp(`export \\{[^}]*${name}`,'s'));
  assert.match(overlays,/disableEscapeKeyDown/);
  assert.match(overlays,/saving/);
  assert.match(overlays,/errorText/);
  assert.match(filters,/flexWrap/);
});

test('#620 real migration pilots delegate select/date-time and confirmation to canonical controls',()=>{
  const runtime=read('frontend/src/components/muiRuntime.js');
  assert.match(runtime,/CgSelect/);
  assert.match(runtime,/React\.createElement\(CgSelect/);
  assert.match(runtime,/CgDatePicker/);
  assert.match(runtime,/CgTimeField/);
  assert.doesNotMatch(runtime,/function SelectIsland[^\n]*React\.createElement\(Mui\.Select/);
  const modal=read('frontend/src/components/modal.js');
  assert.match(modal,/CgConfirmDialog/);
  assert.match(modal,/createRoot/);
  assert.match(modal,/normalizeUiError/);
  const ledger=JSON.parse(read('docs/architecture/forms-interaction-v1.json'));
  assert.equal(ledger.canonicalOwner,'frontend/src/components/vnext/index.js');
  assert.ok(ledger.deprecatedOwners.every((row)=>row.removalCriteria.includes('zero')));
  assert.ok(ledger.pilots.length>=2);
});

test('#620 authority audit and authoritative runner are wired',()=>{
  const result=spawnSync(process.execPath,['scripts/forms-interaction-authority-audit-v620.mjs'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  const report=JSON.parse(result.stdout.trim());
  assert.equal(report.ok,true);
  const runner=read('scripts/run-authoritative-contracts.mjs');
  assert.match(runner,/forms_interaction_issue_620\.test\.mjs/);
});
