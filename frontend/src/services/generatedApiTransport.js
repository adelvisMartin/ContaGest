import { BackendApi } from './backendApi.js';

export function normalizeGeneratedApiPath(path) {
  const value = String(path || '');
  return value.replace(/^\/api\/v1(?=\/|$)/, '') || '/';
}

export const GeneratedApiTransport = Object.freeze({
  request(path, options = {}) {
    return BackendApi.request(normalizeGeneratedApiPath(path), options);
  }
});
