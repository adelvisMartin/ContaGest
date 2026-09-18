import fs from 'node:fs';
import path from 'node:path';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const root=process.cwd();
const fail=(message)=>{console.error(`[erp-ui-purchases][FAIL] ${message}`);process.exitCode=1;};
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');

if(JSON.stringify(PAGE_REGISTRY.compras)!==JSON.stringify(['./pages/PurchasesPage.jsx','PurchasesPage']))fail('purchases registry drift');
const page=read('frontend/src/pages/PurchasesPage.jsx');
const payables=read('frontend/src/components/payables/PayablesPanel.jsx');
if((page.match(/createRoot\(/g)||[]).length!==1)fail('purchases must own exactly one React root');
if(/components\/ui\/index\.js|mountSubmit|querySelector|addEventListener|innerHTML|window\.confirm|window\.prompt/.test(page))fail('imperative purchases lifecycle or legacy kit reintroduced');
if(/querySelector|addEventListener|innerHTML|window\.confirm|window\.prompt/.test(payables))fail('imperative payables lifecycle reintroduced');
for(const primitive of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgDataTable','CgDialog','CgMoney']){
  if(!page.includes(primitive))fail(`purchases missing canonical primitive ${primitive}`);
}
for(const contract of ['SupabaseSyncService.pullPurchases(','SupabaseSyncService.createPurchase(','RuntimePolicy.handlePersistenceFailure(','PurchaseOperationsService.deleteDraft(','PurchaseOperationsService.cancel(']){
  if(!page.includes(contract))fail(`purchases missing preserved contract ${contract}`);
}
for(const contract of ['PayablesService.list(','PayablesService.upload(','PayablesService.openOriginal(','PayablesService.reprocess(','PayablesService.review(','PayablesService.reject(','SupabaseSyncService.pullPurchases(']){
  if(!payables.includes(contract))fail(`payables missing preserved contract ${contract}`);
}
if(fs.existsSync(path.join(root,'frontend/src/pages/PurchasesPage.js')))fail('legacy PurchasesPage.js still exists');
if(fs.existsSync(path.join(root,'frontend/src/components/payables/PayablesPanel.js')))fail('legacy PayablesPanel.js still exists');
if(!process.exitCode)console.log('[erp-ui-purchases][PASS] Purchases and payables are React/Cg/MUI with financial contracts preserved.');
