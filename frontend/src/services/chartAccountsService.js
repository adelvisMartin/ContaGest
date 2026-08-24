import { BackendApi } from './backendApi.js';

const normalizeAccount=(account={})=>({
  code:String(account.code||'').trim(),
  name:String(account.name||'').trim(),
  type:String(account.type||'').trim(),
  nature:account.nature==='credit'?'credit':'debit',
  level:Math.max(1,Number(account.level||String(account.code||'').split('.').filter(Boolean).length||1)),
  parentCode:account.parentCode||null,
  allowPosting:account.allowPosting!==false,
  description:account.description||null,
  active:account.active!==false
});

export const ChartAccountsService={
  list(){return BackendApi.get('/chart-accounts');},
  create(account){return BackendApi.post('/chart-accounts',normalizeAccount(account));},
  syncTemplate(){return BackendApi.post('/chart-accounts/sync-template',{});},
  validateEntry(lines){return BackendApi.post('/chart-accounts/validate-entry',{lines});},
  normalizeAccount
};
