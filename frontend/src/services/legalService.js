import { BackendApi } from './backendApi.js';

export const LegalService={
  publicCatalog(){return BackendApi.request('/legal/public',{noAuth:true});},
  status(){return BackendApi.get('/legal/status');},
  accept(payload){return BackendApi.post('/api/v1/legal/accept',payload);},
  updateCookiePreferences(payload){return BackendApi.request('/legal/cookie-preferences',{method:'PATCH',body:payload});}
};
