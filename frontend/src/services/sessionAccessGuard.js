import { AccessControlService } from './accessControlService.js';

let installed = false;
const CORE = new Set(['dashboard','login','profile','ayuda','soporte']);
const ADMIN_SENSITIVE = new Set(['admin','backend','configuracion','marca','modulos-madurez','pretesting','licencias','demo-control','vistas','importacion-data']);
const ADMIN_ROLES = new Set(['admin','administrator','administrador','sysadmin','superadmin']);

const normalizeRole = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const isActiveQaLicense = (state, route) => {
  const license = state?.activeLicense;
  if (license?.qaMode !== true || license?.status !== 'active') return false;
  if (license.expiresAt && new Date(license.expiresAt).getTime() <= Date.now()) return false;
  return CORE.has(route) || (Array.isArray(license.modules) && license.modules.includes(route));
};

export function installSessionAccessGuard() {
  if (installed) return;
  installed = true;
  queueMicrotask(() => {
    const previous = AccessControlService.canAccessRoute.bind(AccessControlService);
    AccessControlService.canAccessRoute = (state, route) => {
      if (!route || CORE.has(route)) return previous(state, route);
      const allowedByExistingRules = previous(state, route);
      if (!allowedByExistingRules) return false;

      // QA integral is a time-bound, audited license. The backend remains authoritative
      // for every protected operation; this only prevents stale client-role metadata
      // from hiding modules explicitly enabled by the active QA license.
      if (isActiveQaLicense(state, route)) return true;

      const profile = state?.profile || {};
      const role = normalizeRole(profile.role);
      const permissions = Array.isArray(profile.permissions) ? profile.permissions.map(String) : [];
      const wildcard = permissions.includes('*');
      const adminPermission = wildcard || permissions.includes('admin.manage');
      const adminRole = ADMIN_ROLES.has(role);
      const catalogued = AccessControlService.modules.some((item) => item.route === route);
      const required = catalogued ? AccessControlService.routePermission(route) : null;

      if (ADMIN_SENSITIVE.has(route)) {
        if (role === 'client') return false;
        if (required === 'admin.manage' && !adminRole && !adminPermission) return false;
        if (permissions.length && required && !wildcard && !permissions.includes(required) && !permissions.includes('admin.manage')) return false;
      }

      if (catalogued && permissions.length && required && !wildcard && !permissions.includes(required) && !permissions.includes('admin.manage')) return false;
      return true;
    };
  });
}
