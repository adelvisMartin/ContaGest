import { BackendApi } from './backendApi.js';

function query(params={}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key,value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') search.set(key, String(value));
  });
  const suffix = search.toString();
  return suffix ? `?${suffix}` : '';
}

export const CommercialService = {
  plans(){ return BackendApi.get('/commercial/plans'); },
  summary(){ return BackendApi.get('/commercial/summary'); },
  customers(){ return BackendApi.get('/commercial/customers'); },
  createCustomer(data){ return BackendApi.post('/commercial/customers', data); },
  agents(){ return BackendApi.get('/commercial/agents'); },
  createAgent(data){ return BackendApi.post('/commercial/agents', data); },
  subscriptions(filters={}){ return BackendApi.get(`/commercial/subscriptions${query(filters)}`); },
  createSubscription(data){ return BackendApi.post('/commercial/subscriptions', data); },
  updateSubscription(id,data){ return BackendApi.request(`/commercial/subscriptions/${encodeURIComponent(id)}`,{method:'PATCH',body:data}); },
  transitionSubscription(id,status,reason){ return BackendApi.post(`/commercial/subscriptions/${encodeURIComponent(id)}/status`,{status,reason}); },
  attachTenant(id,data){ return BackendApi.post(`/commercial/subscriptions/${encodeURIComponent(id)}/tenants`,data); },
  removeTenant(id,tenantId){ return BackendApi.request(`/commercial/subscriptions/${encodeURIComponent(id)}/tenants/${encodeURIComponent(tenantId)}/remove`,{method:'PATCH',body:{}}); },
  setModules(id,modules){ return BackendApi.request(`/commercial/subscriptions/${encodeURIComponent(id)}/modules`,{method:'PUT',body:{modules,replace:true}}); },
  renewals(days=30){ return BackendApi.get(`/commercial/renewals?days=${encodeURIComponent(days)}`); },
  payments(limit=250){ return BackendApi.get(`/commercial/payments?limit=${encodeURIComponent(limit)}`); },
  registerPayment(data){ return BackendApi.post('/commercial/payments',data); },
  commissions(filters={}){ return BackendApi.get(`/commercial/commissions${query(filters)}`); },
  updateCommissionStatus(id,status,reason){ return BackendApi.post(`/commercial/commissions/${encodeURIComponent(id)}/status`,{status,reason}); },
  activity(limit=80){ return BackendApi.get(`/commercial/activity?limit=${encodeURIComponent(limit)}`); }
};
