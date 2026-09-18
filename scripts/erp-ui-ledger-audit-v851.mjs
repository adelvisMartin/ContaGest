import fs from 'node:fs';
import path from 'node:path';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const root=process.cwd();
const fail=(message)=>{console.error(`[erp-ui-ledger][FAIL] ${message}`);process.exitCode=1;};
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');

if(JSON.stringify(PAGE_REGISTRY.contabilidad)!==JSON.stringify(['./pages/LedgerPage.jsx','LedgerPage']))fail('ledger registry drift');
const source=read('frontend/src/pages/LedgerPage.jsx');
if((source.match(/createRoot\(/g)||[]).length!==1)fail('ledger must own exactly one React root');
if(/components\/ui\/index\.js|mountSubmit|querySelector|addEventListener|innerHTML/.test(source))fail('imperative ledger lifecycle or legacy kit reintroduced');
for(const primitive of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgDataTable','CgMoney','CgState']){
  if(!source.includes(primitive))fail(`ledger missing canonical primitive ${primitive}`);
}
for(const contract of ['calculateLedger(','SupabaseSyncService.pullLedger(','SupabaseSyncService.createLedgerEntry(lineA)','SupabaseSyncService.createLedgerEntry(lineB)',"uid('entry')","uid('log')",'create-balanced-document-local','csvFromEntries','htmlBook','downloadText']){
  if(!source.includes(contract))fail(`ledger missing preserved contract ${contract}`);
}
if(fs.existsSync(path.join(root,'frontend/src/pages/LedgerPage.js')))fail('legacy LedgerPage.js still exists');
if(!process.exitCode)console.log('[erp-ui-ledger][PASS] Ledger is React/Cg/MUI with balanced document and export contracts preserved.');
