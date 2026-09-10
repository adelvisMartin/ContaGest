import { BackendApi } from './backendApi.js';

export const ApprovalsService={
  capabilities(){return BackendApi.get('/approvals/capabilities');},
  executionContext(method,path,body={}){return BackendApi.post('/approvals/execution-context',{method,path,body});},
  policies(){return BackendApi.get('/approvals/policies');},
  createPolicy(capability,data){return BackendApi.post(`/approvals/policies/${encodeURIComponent(capability)}/versions`,data);},
  mine(){return BackendApi.get('/approvals/mine');},
  inbox(){return BackendApi.get('/approvals/inbox');},
  report(){return BackendApi.get('/approvals/report');},
  request(data){return BackendApi.post('/approvals/requests',data);},
  revise(id,data){return BackendApi.patch(`/approvals/requests/${encodeURIComponent(id)}`,data);},
  approve(id,data={}){return BackendApi.post(`/approvals/requests/${encodeURIComponent(id)}/approve`,data);},
  reject(id,data={}){return BackendApi.post(`/approvals/requests/${encodeURIComponent(id)}/reject`,data);},
  cancel(id){return BackendApi.post(`/approvals/requests/${encodeURIComponent(id)}/cancel`,{});},
  breakGlass(id,data){return BackendApi.post(`/approvals/requests/${encodeURIComponent(id)}/break-glass`,data);},
  delegate(data){return BackendApi.post('/approvals/delegations',data)},
  withApproval(id){return {'x-approval-request-id':id};}
};
