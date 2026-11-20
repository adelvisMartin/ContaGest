import { BackendApi } from './backendApi.js';
import { ACCESS_MANIFEST } from 'contagest-ve-backend/access-manifest';

// Preview options come from the same server-owned manifest as licence grants.
// Displaying an option never grants RBAC/entitlements by itself.
const blockedDemoPermissions = new Set([
  'admin.manage', 'audit.view', 'demos.manage', 'licenses.manage', 'modules.manage'
]);
const demoModules = Object.freeze(ACCESS_MANIFEST.modules
  .filter((item) => !blockedDemoPermissions.has(item.permission) &&
    !item.permission.startsWith('platform.'))
  .map((item) => item.route));

export const DemoAccessService = {
  modules: demoModules,
  defaultDemo() {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10);
    return {
      id: `demo_${Date.now().toString(36)}`,
      prospect: 'Cliente potencial',
      email: 'demo@empresa.com',
      phone: '+584120000000',
      enabledModules: ['dashboard','ventas','pedidos','pos-sede','tracking-pedidos','analytics']
        .filter((route) => demoModules.includes(route)),
      expiresAt,
      maxUsers: 3,
      status: 'active',
      notes: 'Demo comercial controlado'
    };
  },
  async list() {
    return BackendApi.get('/demos/access');
  },
  async saveDemo(demo) {
    // BackendApi already owns /api/v1, cookies, CSRF and tenant identity.
    // Never prepend /api/v1 again and never convert a persistence failure into
    // a fake local success.
    return BackendApi.post('/demos/access', demo);
  }
};
