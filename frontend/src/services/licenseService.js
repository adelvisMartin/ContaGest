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

function deviceLabel() {
  const platform = navigator.userAgentData?.platform || navigator.platform || 'Dispositivo';
  const mobile = navigator.userAgentData?.mobile || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return `${mobile ? 'Móvil' : 'Equipo'} · ${platform}`.slice(0, 120);
}

export const LicenseService = {
  async list() {
    return BackendApi.get('/licenses');
  },

  async generate(payload) {
    return BackendApi.post('/api/v1/licenses', payload);
  },

  async validate(licenseKey, route = 'dashboard') {
    return BackendApi.post('/api/v1/licenses/validate', { licenseKey, route, deviceId: deviceId(), deviceLabel: deviceLabel() });
  },

  async heartbeat(licenseKey, route = 'dashboard') {
    return BackendApi.post('/api/v1/licenses/heartbeat', { licenseKey, route, deviceId: deviceId(), deviceLabel: deviceLabel() });
  },

  async revoke(id) {
    return BackendApi.request(`/licenses/${encodeURIComponent(id)}/revoke`, { method:'PATCH', body:{} });
  },

  deviceId,
  deviceLabel
};
