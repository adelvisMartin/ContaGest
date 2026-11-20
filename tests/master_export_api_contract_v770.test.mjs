import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const routes=readFileSync(new URL('../backend/src/modules/imports/imports.routes.ts',import.meta.url),'utf8');
const service=readFileSync(new URL('../frontend/src/services/dataImportService.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../frontend/src/pages/DataImportPage.js',import.meta.url),'utf8');
const exportRoute=routes.split("router.get('/exports/:type'")[1]?.split("router.get('/:id'")[0]||'';

test('#770 master-data exports require tenant admin and valid actor',()=>{
 assert.match(routes,/router\.use\(requireTenant, requirePermission\('admin\.manage'\)\)/);
 assert.match(routes,/const exportTypeSchema = z\.enum\(\['clients', 'suppliers', 'inventory', 'accounts'\]\)/);
 assert.match(exportRoute,/if \(!ctx\.userId\) throw new HttpError\(401/);
 assert.match(exportRoute,/exportTypeSchema\.parse\(req\.params\.type\)/);
 assert.match(routes,/limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(500\)/);
 assert.match(routes,/cursor: z\.string\(\)\.uuid\(\)\.optional\(\)/);
});

test('#770 exports isolate tenant and audit each page within DB transaction',()=>{
 for(const model of ['client','supplier','product','chartAccount'])
   assert.match(exportRoute,new RegExp('tx\\.'+model+'\\.findMany\\(\\{where'));
 assert.match(exportRoute,/prisma\.\$transaction\(async \(tx\) => \{/);
 assert.match(exportRoute,/where=\{tenantId:ctx\.tenantId/);
 assert.match(exportRoute,/take:limit\+1/);
 assert.match(exportRoute,/writeAudit\(\{tenantId:ctx\.tenantId,userId:ctx\.userId,action:'master\.export'/);
 assert.match(exportRoute,/userAgent:ctx\.userAgent\},tx\)/);
});

test('#770 UI can page CSV/JSON without silent partial download',()=>{
 assert.match(service,/exportMasterPage\(type,\{format='csv',limit=500,cursor=null\}=\{\}\)/);
 assert.match(ui,/id:'btnExportMaster'/);
 assert.match(ui,/exportMasterPage\(type,\{format,limit:500,cursor\}\)/);
 assert.match(ui,/page\.hasMore&&pages>=100/);
 assert.match(ui,/if\(exporting\)return/);
 assert.match(ui,/finally\{[\s\S]*?button\.disabled=false/);
});
