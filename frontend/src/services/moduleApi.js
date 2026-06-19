import { BackendApi } from './backendApi.js';

function normalizePayload(data) {
  if (data && typeof data === 'object' && 'data' in data) return data.data;
  return data;
}

export const ModuleApi = {
  async registry() {
    return normalizePayload(await BackendApi.request('/modules'));
  },
  async list(slug) {
    return normalizePayload(await BackendApi.request(`/modules/${encodeURIComponent(slug)}/records`));
  },
  async create(slug, payload) {
    return normalizePayload(await BackendApi.request(`/modules/${encodeURIComponent(slug)}/records`, { method: 'POST', body: JSON.stringify(payload) }));
  },
  async update(slug, id, payload) {
    return normalizePayload(await BackendApi.request(`/modules/${encodeURIComponent(slug)}/records/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }));
  },
  async remove(slug, id) {
    return normalizePayload(await BackendApi.request(`/modules/${encodeURIComponent(slug)}/records/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  }
};
