import { BackendApi } from './backendApi.js';

const query=(params={})=>{const qs=new URLSearchParams();Object.entries(params).forEach(([key,value])=>{if(value!==undefined&&value!==null&&String(value)!==''&&String(value)!=='all')qs.set(key,String(value));});const value=qs.toString();return value?`?${value}`:'';};
const idem=()=>{const id=globalThis.crypto?.randomUUID?.();return id?`cg-reconcile-${id}`:`cg-reconcile-${Date.now()}-${Math.random().toString(16).slice(2)}`;};

export const BankReconciliationService={
  imports(filters={}){return BackendApi.get(`/bank-reconciliation/imports${query(filters)}`);},
  lines(filters={}){return BackendApi.get(`/bank-reconciliation/lines${query(filters)}`);},
  candidates(lineId){return BackendApi.get(`/bank-reconciliation/lines/${encodeURIComponent(lineId)}/candidates`);},
  history(lineId){return BackendApi.get(`/bank-reconciliation/lines/${encodeURIComponent(lineId)}/history`);},
  models(){return BackendApi.get('/bank-reconciliation/models');},
  closingBalance(accountId,importId){return BackendApi.get(`/bank-reconciliation/closing-balance${query({accountId,importId})}`);},
  importStatement(accountId,file){const form=new FormData();form.append('file',file,file.name);return BackendApi.request(`/bank-reconciliation/imports${query({accountId})}`,{method:'POST',body:form});},
  reconcile(lineId,allocations,{confidence,reasons,idempotencyKey}={}){return BackendApi.request(`/bank-reconciliation/lines/${encodeURIComponent(lineId)}/reconcile`,{method:'POST',headers:{'Idempotency-Key':idempotencyKey||idem()},body:{allocations,confidence,reasons}});},
  createModel(payload){return BackendApi.post('/bank-reconciliation/models',payload);},
  writeOff(lineId,payload,{idempotencyKey,approvalRequestId}={}){return BackendApi.request(`/bank-reconciliation/lines/${encodeURIComponent(lineId)}/write-off`,{method:'POST',headers:{'Idempotency-Key':idempotencyKey||idem(),...(approvalRequestId?{'x-approval-request-id':approvalRequestId}:{})},body:payload});},
  reverse(reconciliationId,payload){return BackendApi.post(`/bank-reconciliation/reconciliations/${encodeURIComponent(reconciliationId)}/reverse`,payload);}
};
