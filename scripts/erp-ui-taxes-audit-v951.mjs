import fs from 'node:fs';
import path from 'node:path';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const root=process.cwd();
const fail=(message)=>{console.error(`[erp-ui-taxes][FAIL] ${message}`);process.exitCode=1;};
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');

if(JSON.stringify(PAGE_REGISTRY.tributos)!==JSON.stringify(['./pages/TaxesPage.jsx','TaxesPage']))fail('taxes registry drift');
const source=read('frontend/src/pages/TaxesPage.jsx');
if((source.match(/createRoot\(/g)||[]).length!==1)fail('taxes must own exactly one React root');
if(/components\/ui\/index\.js|querySelector|addEventListener|innerHTML|mountSubmit/.test(source))fail('imperative taxes lifecycle or legacy kit reintroduced');
for(const primitive of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgDataTable','CgState']){
  if(!source.includes(primitive))fail(`taxes missing canonical primitive ${primitive}`);
}
for(const contract of ['draft.quote.taxes','FiscalService.periods(','FiscalService.documents(','FiscalService.createDocument(','fiscal.manage_documents','status===403','JSON.parse','Array.isArray']){
  if(!source.includes(contract))fail(`taxes missing preserved contract ${contract}`);
}
if(fs.existsSync(path.join(root,'frontend/src/pages/TaxesPage.js')))fail('legacy TaxesPage.js still exists');
if(!process.exitCode)console.log('[erp-ui-taxes][PASS] Taxes is React/Cg/MUI with local tax settings and fiscal server authority preserved.');
