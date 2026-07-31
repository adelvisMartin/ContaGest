import { BackendApi } from './backendApi.js';

const DEVICE_KEY = 'contagest_device_id';

function deviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = `cgdev_${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

export const LicenseService = {
  async list() {
    return BackendApi.get('/licenses');
  },

  async generate(payload) {
    return BackendApi.post('/api/v1/licenses', payload);
  },

  async validate(licenseKey, route = 'dashboard') {
    return BackendApi.post('/api/v1/licenses/validate', { licenseKey, route, deviceId: deviceId() });
  },

  async heartbeat(licenseKey, route = 'dashboard') {
    return BackendApi.post('/api/v1/licenses/heartbeat', { licenseKey, route, deviceId: deviceId() });
  },

  async revoke(id) {
    return BackendApi.request(`/licenses/${encodeURIComponent(id)}/revoke`, { method:'PATCH', body:{} });
  },

  deviceId
};
