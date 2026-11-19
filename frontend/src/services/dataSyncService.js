import './uiEnhancementService.js';
import { apiGet, apiPost } from './apiClient.js';
import { resolveApprovedSyncBase } from './apiBaseOriginPolicy.mjs';

export const SYNC_RESOURCES=['clients','inventory','history','taxes','ledger','banking','payroll','suppliers','purchases','sales','tasks','profile','admin','brand'];
const readResource=(state,resource)=>resource==='taxes'?state.quote?.taxes||{}:state[resource]??[];
const writeResource=(draft,resource,value)=>{if(resource==='taxes')draft.quote.taxes=value||draft.quote.taxes;else draft[resource]=value;};
const CONFIGURED_SYNC_ORIGINS = [
  import.meta?.env?.VITE_API_BASE_URL || '',
  ...String(import.meta?.env?.VITE_API_ALLOWED_ORIGINS || '').split(',')
];

function trustedSyncBase(baseUrl) {
  const isBrowser = typeof window !== 'undefined';
  const approved = resolveApprovedSyncBase(baseUrl, {
    currentOrigin: isBrowser ? window.location.origin : '',
    configuredOrigins: CONFIGURED_SYNC_ORIGINS,
    development: import.meta?.env?.DEV === true,
    native: isBrowser && window.Capacitor?.isNativePlatform?.() === true
  });
  if (!approved) {
    const error = new Error('La URL de sincronización no está autorizada. Usa el dominio de ContaGest o un servidor HTTPS aprobado.');
    error.status = 400;
    throw error;
  }
  return approved;
}

export const DataSyncService={
  health(baseUrl){return apiGet(trustedSyncBase(baseUrl),'/api/health');},
  async pushAll(baseUrl,state){const approved=trustedSyncBase(baseUrl);const results=[];for(const resource of SYNC_RESOURCES)results.push(await apiPost(approved,`/api/${resource}`,readResource(state,resource)));return results;},
  async pullAll(baseUrl,draft){const approved=trustedSyncBase(baseUrl);const results=[];for(const resource of SYNC_RESOURCES){try{writeResource(draft,resource,await apiGet(approved,`/api/${resource}`));results.push({resource,ok:true});}catch(error){results.push({resource,ok:false,message:error.message});}}return results;}
};