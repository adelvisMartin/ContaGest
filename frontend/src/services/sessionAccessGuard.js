import { AccessControlService } from './accessControlService.js';

let installed = false;
const CORE = new Set(['dashboard','login','profile','ayuda','soporte']);
const ADMIN_SENSITIVE = new Set(['admin','backend','configuracion','marca','modulos-madurez','pretesting','licencias','demo-control','vistas','importacion-data']);

export function installSessionAccessGuard() {
  if (installed) return;
  installed = true;
  queueMicrotask(() => {
    const previous = AccessControlService.canAccessRoute.bind(AccessControlService);
    AccessControlService.canAccessRoute = (state, route) => {
      if (!route || CORE.has(route)) return previous(state, route);
      const allowedByExistingRules = previous(state, route);
      if (!allowedByExistingRules) return false;

      const profile = state?.profile || {};
      const role = String(profile.role || '').toLowerCase();
      const permissions = Array.isArray(profile.permissions) ? profile.permissions.map(String) : [];
      const catalogued = AccessControlService.modules.some((item) => item.route === route);
      const required = catalogued ? AccessControlService.routePermission(route) : null;

      if (ADMIN_SENSITIVE.has(route)) {
        if (role === 'client') return false;
        if (required === 'admin.manage' && role !== 'admin') return false;
        if (permissions.length && required && !permissions.includes(required) && !permissions.includes('admin.manage')) return false;
      }

      if (catalogued && permissions.length && required && !permissions.includes(required) && !permissions.includes('admin.manage')) return false;
      return true;
    };
  });
}
