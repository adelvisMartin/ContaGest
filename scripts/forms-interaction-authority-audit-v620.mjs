#!/usr/bin/env node
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const required=['CgFormField','CgSelect','CgAutocomplete','CgCombobox','CgCheckbox','CgRadioGroup','CgSwitch','CgDatePicker','CgDateRange','CgTimeField','CgDialog','CgConfirmDialog','CgDrawer','CgPopover','CgMenu','CgFilterBar','CgFilterChip'];
const index=read('frontend/src/components/vnext/index.js');
const forms=read('frontend/src/components/vnext/forms.js');
const overlays=read('frontend/src/components/vnext/overlays.js');
const filters=read('frontend/src/components/vnext/filters.js');
const runtime=read('frontend/src/components/muiRuntime.js');
const modal=read('frontend/src/components/modal.js');
const ledger=JSON.parse(read('docs/architecture/forms-interaction-v1.json'));
const failures=[];

for(const name of required)if(!index.includes(name))failures.push(`MISSING_EXPORT:${name}`);
for(const [name,source] of [['forms',forms],['overlays',overlays],['filters',filters]])if(source.includes("from './index.js'"))failures.push(`BARREL_CYCLE:${name}`);
if(!/React\.createElement\(CgSelect/.test(runtime)||/function SelectIsland[^\n]*React\.createElement\(Mui\.Select/.test(runtime))failures.push('SELECT_PILOT_BYPASSES_CANONICAL');
if(!runtime.includes('CgDatePicker')||!runtime.includes('CgTimeField'))failures.push('DATE_TIME_PILOT_MISSING');
if(!modal.includes('CgConfirmDialog')||!modal.includes('normalizeUiError'))failures.push('CONFIRM_PILOT_MISSING');
if(ledger.canonicalOwner!=='frontend/src/components/vnext/index.js')failures.push('INVALID_CANONICAL_OWNER');
if(!Array.isArray(ledger.pilots)||ledger.pilots.length<2)failures.push('INSUFFICIENT_PILOTS');
if((ledger.deprecatedOwners||[]).some((row)=>!String(row.removalCriteria||'').includes('zero')))failures.push('DEPRECATION_WITHOUT_ZERO_CONSUMER_EXIT');

const report={ok:failures.length===0,required:required.length,pilots:ledger.pilots?.length||0,failures};
console.log(JSON.stringify(report));
if(failures.length)process.exitCode=1;
