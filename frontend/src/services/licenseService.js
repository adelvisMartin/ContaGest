import { BackendApi } from './backendApi.js';

async function sha256(text) {
  const buffer = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const LicenseService = {
  async generateKey({ userEmail, modules = [], days = 15, plan = 'trial' }) {
    const expiresAt = new Date(Date.now() + Number(days || 0) * 86400000).toISOString();
    const seed = `${userEmail}|${modules.join(',')}|${expiresAt}|${plan}|${crypto.randomUUID()}`;
    const hash = await sha256(seed);
    return { id: `lic_${Date.now().toString(36)}`, userEmail, modules, plan, days: Number(days), expiresAt, key: `CGVE-${hash.slice(0, 8).toUpperCase()}-${hash.slice(8, 16).toUpperCase()}-${hash.slice(16, 24).toUpperCase()}`, fingerprint: hash, status: 'active', createdAt: new Date().toISOString(), lastSeenAt: null };
  },
  async save(license) {
    try { return await BackendApi.post('/api/v1/licenses', license); }
    catch (error) { return { ok: false, offline: true, data: license, error: error.message }; }
  },
  async heartbeat(licenseKey, route) {
    try { return await BackendApi.post('/api/v1/licenses/heartbeat', { licenseKey, route, at: new Date().toISOString() }); }
    catch { return { ok: false, offline: true }; }
  }
};
