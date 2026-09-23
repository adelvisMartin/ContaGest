import { BackendApi } from './backendApi.js';
import { AccessControlService } from './accessControlService.js';
import { installAdminUserSecurityEnhancer } from './adminUserSecurityEnhancer.js';

installAdminUserSecurityEnhancer();

export const RbacService = {
  async summary() {
    return BackendApi.request('/rbac/summary');
  },
  async bootstrap() {
    return BackendApi.request('/rbac/bootstrap', { method:'POST', body:{ source:'frontend-admin' } });
  },
  async saveRoleModules(role) {
    const permissionKeys = (role.modules || []).map((route) => AccessControlService.routePermission(route)).filter(Boolean);
    return BackendApi.request(`/rbac/roles/${encodeURIComponent(role.name)}/permissions`, { method:'PUT', body:{ permissionKeys:[...new Set(permissionKeys)] } });
  },
  async createDemoAccess(demo) {
    return BackendApi.request('/demos/access', { method:'POST', body:demo });
  },
  async createDemoUser(user) {
    return BackendApi.request('/rbac/demo-users', { method:'POST', body:user });
  },
  async updateDemoUser(userId, user) {
    return BackendApi.request(`/rbac/demo-users/${encodeURIComponent(userId)}`, { method:'PUT', body:user });
  },
  async securityUsers() {
    return BackendApi.request('/user-security/users');
  },
  async updateSecurityUser(userId, changes) {
    return BackendApi.request(`/user-security/users/${encodeURIComponent(userId)}`, { method:'PATCH', body:changes });
  }
};
