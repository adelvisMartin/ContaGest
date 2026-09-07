import { BackendApi } from './backendApi.js';

const unwrapDocument = (value) => value?.document || value;

export const PayablesService = {
  list() {
    return BackendApi.request('/payables/documents');
  },

  get(id) {
    return BackendApi.request(`/payables/documents/${encodeURIComponent(id)}`);
  },

  async upload(file) {
    const form = new FormData();
    form.append('file', file, file.name);
    return BackendApi.request('/payables/documents', { method:'POST', body:form });
  },

  reprocess(id, version='2.0.0') {
    return BackendApi.request(`/payables/documents/${encodeURIComponent(id)}/reprocess`, { method:'POST', body:{version} });
  },

  review(id, { confirmedFields=[], corrections={} }={}) {
    return BackendApi.request(`/payables/documents/${encodeURIComponent(id)}/review`, { method:'POST', body:{confirmedFields,corrections} });
  },

  reject(id, reason) {
    return BackendApi.request(`/payables/documents/${encodeURIComponent(id)}/reject`, { method:'POST', body:{reason} });
  },

  async openOriginal(id) {
    const response = await BackendApi.request(`/payables/documents/${encodeURIComponent(id)}/content`, { raw:true });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url,'_blank','noopener,noreferrer');
    window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
  },

  requiredConfirmations(document, threshold=0.8) {
    const extraction=document?.parserResult || {};
    return Object.entries(extraction)
      .filter(([key,value])=>!['lines','warnings'].includes(key) && value && typeof value==='object' && Number(value.confidence ?? 0)<threshold)
      .map(([key])=>key);
  },

  normalize(value) { return unwrapDocument(value); }
};
