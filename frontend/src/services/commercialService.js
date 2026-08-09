import { BackendApi } from './backendApi.js';

export const CommercialService = {
  plans(){ return BackendApi.get('/commercial/plans'); },
  summary(){ return BackendApi.get('/commercial/summary'); },
  customers(){ return BackendApi.get('/commercial/customers'); },
  createCustomer(data){ return BackendApi.post('/api/v1/commercial/customers', data); },
  agents(){ return BackendApi.get('/commercial/agents'); },
  createAgent(data){ return BackendApi.post('/api/v1/commercial/agents', data); },
  subscriptions(){ return BackendApi.get('/commercial/subscriptions'); },
  createSubscription(data){ return BackendApi.post('/api/v1/commercial/subscriptions', data); },
  updateSubscription(id,data){ return BackendApi.request(`/commercial/subscriptions/${encodeURIComponent(id)}`,{method:'PATCH',body:data}); },
  attachTenant(id,data){ return BackendApi.post(`/api/v1/commercial/subscriptions/${encodeURIComponent(id)}/tenants`,data); },
  removeTenant(id,tenantId){ return BackendApi.request(`/commercial/subscriptions/${encodeURIComponent(id)}/tenants/${encodeURIComponent(tenantId)}/remove`,{method:'PATCH',body:{}}); },
  setModules(id,modules){ return BackendApi.request(`/commercial/subscriptions/${encodeURIComponent(id)}/modules`,{method:'PUT',body:{modules,replace:true}}); },
  renewals(days=30){ return BackendApi.get(`/commercial/renewals?days=${encodeURIComponent(days)}`); },
  registerPayment(data){ return BackendApi.post('/api/v1/commercial/payments',data); },
  commissions(){ return BackendApi.get('/commercial/commissions'); }
};
