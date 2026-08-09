import { AccessControlService } from './accessControlService.js';

let installed = false;
const CORE = new Set(['dashboard','login','profile','ayuda','soporte']);

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
      const required = AccessControlService.routePermission(route);

      if (required === 'admin.manage' && role !== 'admin') return false;
      if (permissions.length && required && !permissions.includes(required)) return false;
      return true;
    };
  });
}
