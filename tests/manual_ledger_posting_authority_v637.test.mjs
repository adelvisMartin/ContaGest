import test from 'node:test';
import assert from 'node:assert/strict';
import { assertManualPostingAccounts } from '../backend/src/modules/accounting/manual-posting-policy.ts';
const tenant = 'tenant-A';
const accounts = Object.freeze([
  {tenantId:tenant, code:'1.01', active:true, allowPosting:true},
  {tenantId:tenant, code:'4.01', active:true, allowPosting:true}
]);
const lines = Object.freeze([{accountCode:'1.01'}, {accountCode:'4.01'}]);
const go = (a=accounts,l=lines,t=tenant)=>assertManualPostingAccounts(t,l,a);
const denied = fn=>assert.throws(fn,{message:'MANUAL_POSTING_ACCOUNT_NOT_AUTHORIZED'});
test('#637 accepts active postable tenant chart accounts',()=>{assert.doesNotThrow(()=>go());assert.equal(go(),undefined);});
test('#637 rejects cross-tenant code even when code exists in tenant A',()=>{denied(()=>go(accounts,lines,'tenant-B'));denied(()=>go([...accounts,{...accounts[0],tenantId:'tenant-B',code:'other'}]));});
test('#637 rejects unknown account, invalid code and duplicates',()=>{denied(()=>go(accounts,[lines[0],{accountCode:'missing'}]));denied(()=>go(accounts,[lines[0],{accountCode:''}]));denied(()=>go([...accounts,accounts[0]]));});
test('#637 rejects disabled and grouping accounts',()=>{denied(()=>go([{...accounts[0],active:false},accounts[1]]));denied(()=>go([accounts[0],{...accounts[1],allowPosting:false}]));});
test('#637 rejects too few, too many, malformed lines and tenant identity',()=>{denied(()=>go(accounts,[]));denied(()=>go(accounts,[lines[0]]));denied(()=>go(accounts,Array.from({length:201},()=>lines[0])));denied(()=>go(accounts,[lines[0],null]));denied(()=>go(accounts,lines,''));});
test('#637 does not mutate inputs or impose fixed codes',()=>{const snapshot=JSON.stringify([accounts,lines]);go();assert.equal(JSON.stringify([accounts,lines]),snapshot);assert.doesNotThrow(()=>go(accounts,[{accountCode:'4.01'},{accountCode:'1.01'}]));});
