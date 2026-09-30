import { BackendApi } from './backendApi.js';
export const BusinessLocationsService={
  list({search='',status=''}={}){const q=new URLSearchParams();if(search)q.set('search',search);if(status&&status!=='all')q.set('status',status);return BackendApi.get(`/business-locations${q.size?`?${q}`:''}`);},
  get(id){return BackendApi.get(`/business-locations/${encodeURIComponent(id)}`);},
  create(data){return BackendApi.post('/business-locations',data);},
  update(id,data){return BackendApi.patch(`/business-locations/${encodeURIComponent(id)}`,data);},
  deactivate(id){return BackendApi.post(`/business-locations/${encodeURIComponent(id)}/deactivate`,{});},
  close(id){return BackendApi.post(`/business-locations/${encodeURIComponent(id)}/close`,{});},
  reopen(id){return BackendApi.post(`/business-locations/${encodeURIComponent(id)}/reopen`,{});}
};
