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

const validLicense = (license) => Boolean(
  license?.status === 'active' && (!license.expiresAt || new Date(license.expiresAt).getTime() > Date.now())
);

const isActiveQaLicense = (state, route) => {
  const license = state?.activeLicense;
  if (license?.qaMode !== true || !validLicense(license)) return false;
  return CORE.has(route) || (Array.isArray(license.modules) && license.modules.includes(route));
};

const profileAccess = (state = {}) => {
  const profile = state.profile || {};
  const role = normalizeRole(profile.role);
  const permissions = Array.isArray(profile.permissions) ? profile.permissions.map(String) : [];
  return {
    role,
    permissions,
    isClient: role === 'client' || role === 'cliente',
    isAdmin: ADMIN_ROLES.has(role) || permissions.includes('*') || permissions.includes('admin.manage')
  };
};

export function installSessionAccessGuard() {
  if (installed) return;
  installed = true;
  queueMicrotask(() => {
    const previous = AccessControlService.canAccessRoute.bind(AccessControlService);
    AccessControlService.canAccessRoute = (state, route) => {
      if (!route) return false;
      const profile = profileAccess(state);
      const license = state?.activeLicense;

      // QA evaluation access is intentionally checked BEFORE stale local RBAC metadata.
      // The backend remains authoritative for protected writes; this only prevents the
      // navigation shell from hiding modules explicitly granted by an active QA license.
      if (isActiveQaLicense(state, route)) return true;

      // A signed-in internal administrator must be able to inspect every application
      // module for QA. Client accounts never inherit this bypass, even when a profile
      // object was hydrated with broad permissions from a previous session.
      if (profile.isAdmin && !profile.isClient) return true;

      if (CORE.has(route)) return previous(state, route);
      const allowedByExistingRules = previous(state, route);
      if (!allowedByExistingRules) return false;

      const catalogued = AccessControlService.modules.some((item) => item.route === route);
      const required = catalogued ? AccessControlService.routePermission(route) : null;
      const wildcard = profile.permissions.includes('*');
      const adminPermission = wildcard || profile.permissions.includes('admin.manage');

      if (ADMIN_SENSITIVE.has(route)) {
        if (profile.isClient) return false;
        if (required === 'admin.manage' && !profile.isAdmin && !adminPermission) return false;
        if (profile.permissions.length && required && !wildcard && !profile.permissions.includes(required) && !adminPermission) return false;
      }

      // Commercial client access remains license-scoped. An expired or missing license
      // cannot be converted into access by manipulating local route state.
      if (profile.isClient && license) {
        if (!validLicense(license)) return false;
        if (!CORE.has(route) && (!Array.isArray(license.modules) || !license.modules.includes(route))) return false;
      }

      if (catalogued && profile.permissions.length && required && !wildcard && !profile.permissions.includes(required) && !adminPermission) return false;
      return true;
    };
  });
}
