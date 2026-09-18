import fs from 'node:fs';
import path from 'node:path';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const root=process.cwd();
const fail=(message)=>{console.error(`[erp-ui-sales][FAIL] ${message}`);process.exitCode=1;};
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');

if(JSON.stringify(PAGE_REGISTRY.ventas)!==JSON.stringify(['./pages/SalesPage.jsx','SalesPage']))fail('sales registry drift');
const source=read('frontend/src/pages/SalesPage.jsx');
if((source.match(/createRoot\(/g)||[]).length!==1)fail('sales must own exactly one React root');
if(/components\/ui\/index\.js|escapeHtml|mountSubmit|querySelector|addEventListener|innerHTML/.test(source))fail('imperative sales lifecycle or legacy kit reintroduced');
for(const primitive of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgDataTable','CgMoney','CgState']){
  if(!source.includes(primitive))fail(`sales missing canonical primitive ${primitive}`);
}
for(const contract of ['SupabaseSyncService.pullSales(','SupabaseSyncService.createSale(','RuntimePolicy.handlePersistenceFailure(',"navigate('cotizacion')"]){
  if(!source.includes(contract))fail(`sales missing preserved contract ${contract}`);
}
if(fs.existsSync(path.join(root,'frontend/src/pages/SalesPage.js')))fail('legacy SalesPage.js still exists');
if(!process.exitCode)console.log('[erp-ui-sales][PASS] Sales is React/Cg/MUI with persistence and quote contracts preserved.');
