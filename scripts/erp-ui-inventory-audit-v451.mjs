import fs from 'node:fs';
import path from 'node:path';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const root=process.cwd();
const fail=(message)=>{console.error(`[erp-ui-inventory][FAIL] ${message}`);process.exitCode=1;};
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');

const entry=PAGE_REGISTRY.inventario;
if(JSON.stringify(entry)!==JSON.stringify(['./pages/InventoryPage.jsx','InventoryPage']))fail('inventory registry drift');

const source=read('frontend/src/pages/InventoryPage.jsx');
if((source.match(/createRoot\(/g)||[]).length!==1)fail('inventory must own exactly one React root');
if(/components\/ui\/index\.js|escapeHtml|mountSubmit|querySelector|addEventListener|innerHTML|window\.prompt/.test(source))fail('imperative inventory lifecycle or legacy kit reintroduced');
for(const primitive of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgDataTable','CgDialog','CgMoney']){
  if(!source.includes(primitive))fail(`inventory missing canonical primitive ${primitive}`);
}
for(const contract of ['calculateInventory(','RuntimePolicy.handlePersistenceFailure(','SupabaseSyncService.pullProducts(','SupabaseSyncService.createProduct(','InventoryService.createMovement(','InventoryService.adjust(','InventoryService.reverse(']){
  if(!source.includes(contract))fail(`inventory missing preserved contract ${contract}`);
}
if(fs.existsSync(path.join(root,'frontend/src/pages/InventoryPage.js')))fail('legacy InventoryPage.js still exists');
if(!process.exitCode)console.log('[erp-ui-inventory][PASS] Inventory is React/Cg/MUI with stock authority contracts preserved.');
