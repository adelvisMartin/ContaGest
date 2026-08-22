import './uiEnhancementService.js';
import { apiGet, apiPost } from './apiClient.js';

export const SYNC_RESOURCES=['clients','inventory','history','taxes','ledger','banking','payroll','suppliers','purchases','sales','tasks','profile','admin','brand'];
const readResource=(state,resource)=>resource==='taxes'?state.quote?.taxes||{}:state[resource]??[];
const writeResource=(draft,resource,value)=>{if(resource==='taxes')draft.quote.taxes=value||draft.quote.taxes;else draft[resource]=value;};
export const DataSyncService={
  health(baseUrl){return apiGet(baseUrl,'/api/health');},
  async pushAll(baseUrl,state){const results=[];for(const resource of SYNC_RESOURCES)results.push(await apiPost(baseUrl,`/api/${resource}`,readResource(state,resource)));return results;},
  async pullAll(baseUrl,draft){const results=[];for(const resource of SYNC_RESOURCES){try{writeResource(draft,resource,await apiGet(baseUrl,`/api/${resource}`));results.push({resource,ok:true});}catch(error){results.push({resource,ok:false,message:error.message});}}return results;}
};