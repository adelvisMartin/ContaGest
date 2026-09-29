#!/usr/bin/env node
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const required=['CgTable','CgDataGrid','CgPagination','CgSkeleton','CgInlineError','CgRetryState','CgNoResults','CgDetailList','CgKpi','CgMetricGrid','CgStatusSummary','CgToolbar','CgCommandBar','CgSearchField'];
const barrel=read('frontend/src/components/vnext/index.js');
const data=read('frontend/src/components/vnext/data.js');
const bridge=read('frontend/src/components/vnext/dataLegacyBridge.js');
const audit=read('frontend/src/pages/AuditPage.js');
const approvals=read('frontend/src/pages/ApprovalsPage.js');
const failures=[];

for(const name of required)if(!barrel.includes(name))failures.push(`MISSING_EXPORT:${name}`);
if(/@mui\/x-data-grid-(pro|premium)/i.test(data))failures.push('COMMERCIAL_MUI_X_DEPENDENCY');
if(!data.includes("scope:'col'"))failures.push('TABLE_HEADER_SCOPE_MISSING');
if(!bridge.includes('data-cg-data-authority="CgTable"'))failures.push('LEGACY_BRIDGE_NOT_MARKED');
if(/\bErpDataTable\b/.test(audit)||!audit.includes('CgLegacyTable'))failures.push('AUDIT_PILOT_NOT_MIGRATED');
if(/<table>|<thead>|<tbody>/.test(approvals)||!approvals.includes('CgLegacyTable'))failures.push('APPROVALS_PILOT_NOT_MIGRATED');
for(const call of ['ApprovalsService.inbox()','ApprovalsService.mine()','ApprovalsService.report()','ApprovalsService.approve(','ApprovalsService.reject('])if(!approvals.includes(call))failures.push(`APPROVAL_SERVICE_CONTRACT_LOST:${call}`);

const report={ok:failures.length===0,required:required.length,pilots:['AuditPage','ApprovalsPage'],commercialMuiX:false,failures};
console.log(JSON.stringify(report));
if(failures.length)process.exitCode=1;
