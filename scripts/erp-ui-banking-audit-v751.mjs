import fs from 'node:fs';
import path from 'node:path';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const root=process.cwd();
const fail=(message)=>{console.error(`[erp-ui-banking][FAIL] ${message}`);process.exitCode=1;};
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');

if(JSON.stringify(PAGE_REGISTRY.bancos)!==JSON.stringify(['./pages/BankingPage.jsx','BankingPage']))fail('banking registry drift');
const source=read('frontend/src/pages/BankingPage.jsx');
if((source.match(/createRoot\(/g)||[]).length!==1)fail('banking must own exactly one React root');
if(/components\/ui\/index\.js|escapeHtml|mountSubmit|qsa\(|querySelector|addEventListener|innerHTML|window\.confirm|window\.prompt/.test(source))fail('imperative banking lifecycle or legacy kit reintroduced');
for(const primitive of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgDataTable','CgMoney','CgState']){
  if(!source.includes(primitive))fail(`banking missing canonical primitive ${primitive}`);
}
for(const contract of ['BankingService.summary(','BankingService.createAccount(','BankingService.createMovement(','BankingService.reconcile(','BankingService.reverse(','BankingService.correct(','BankReconciliationService.lines(','BankReconciliationService.imports(','BankReconciliationService.models(','BankReconciliationService.closingBalance(','BankReconciliationService.candidates(','BankReconciliationService.history(','BankReconciliationService.reconcile(','BankReconciliationService.writeOff(','BankReconciliationService.reverse(','BankReconciliationService.createModel(','BankReconciliationService.importStatement(']){
  if(!source.includes(contract))fail(`banking missing preserved contract ${contract}`);
}
for(const invariant of ['moneyCents','minExactMoney','approvalRequestId','APPROVAL_REQUIRED','csvCell','sourceHash']){
  if(!source.includes(invariant))fail(`banking missing invariant ${invariant}`);
}
if(fs.existsSync(path.join(root,'frontend/src/pages/BankingPage.js')))fail('legacy BankingPage.js still exists');
if(!process.exitCode)console.log('[erp-ui-banking][PASS] Banking is React/Cg/MUI with reconciliation and financial contracts preserved.');
