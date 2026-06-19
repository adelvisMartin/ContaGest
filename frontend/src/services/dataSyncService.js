import { apiGet, apiPost } from './apiClient.js';

export const SYNC_RESOURCES = [
  'clients','inventory','history','taxes','ledger','banking','payroll','suppliers','purchases','sales','tasks','profile','admin','brand'
];

const readResource = (state, resource) => {
  if (resource === 'taxes') return state.quote?.taxes || {};
  return state[resource] ?? [];
};

const writeResource = (draft, resource, value) => {
  if (resource === 'taxes') draft.quote.taxes = value || draft.quote.taxes;
  else draft[resource] = value;
};

export const DataSyncService = {
  async health(baseUrl) {
    return apiGet(baseUrl, '/api/health');
  },
  async pushAll(baseUrl, state) {
    const results = [];
    for (const resource of SYNC_RESOURCES) {
      const data = readResource(state, resource);
      results.push(await apiPost(baseUrl, `/api/${resource}`, data));
    }
    return results;
  },
  async pullAll(baseUrl, draft) {
    const results = [];
    for (const resource of SYNC_RESOURCES) {
      try {
        const data = await apiGet(baseUrl, `/api/${resource}`);
        writeResource(draft, resource, data);
        results.push({ resource, ok:true });
      } catch (error) {
        results.push({ resource, ok:false, message:error.message });
      }
    }
    return results;
  }
};
