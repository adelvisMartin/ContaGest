import { AccessControlService } from './accessControlService.js';
import { AuthSession } from './authSession.js';

let installed = false;
const CORE = new Set(['dashboard','profile','ayuda','soporte']);
const ADMIN_SENSITIVE = new Set(['admin','backend','configuracion','marca','modulos-madurez','pretesting','licencias','demo-control','vistas','importacion-data']);
const ADMIN_ROLES = new Set(['admin','administrator','administrador','sysadmin','superadmin']);

const normalizeRole = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const normalizePermissions = (value) => Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
const roleName = (role) => typeof role === 'string' ? role : (role?.key || role?.slug || role?.name || role?.id || '');

const validLicense = (license) => Boolean(
  license?.status === 'active' && (!license.expiresAt || new Date(license.expiresAt).getTime() > Date.now())
);

const isActiveQaLicense = (state, route) => {
  const license = state?.activeLicense;
  if (!license || license.qaMode !== true || !validLicense(license)) return false;
  return CORE.has(route) || (Array.isArray(license.modules) && license.modules.includes(route));
};

export const sessionAccess = (session = AuthSession.get()) => {
  if (!session) return null;
  const user = session.user || {};
  const role = normalizeRole(roleName(user.role || session.role));
  const permissions = normalizePermissions(user.permissions || session.permissions);
  const audience = normalizeRole(session.audience);
  const isClient = audience === 'client' || role === 'client' || role === 'cliente';
  return {
    source:'session',
    sessionMode:session.sessionMode || session.mode || 'cookie',
    role,
    permissions,
    audience,
    license:session.license || null,
    isClient,
    isAdmin: !isClient && (ADMIN_ROLES.has(role) || permissions.includes('*') || permissions.includes('admin.manage'))
  };
};

export const canSessionAccessRoute = (identity, route) => {
  if (!identity || !route) return false;
  if (route === 'login') return true;

  const catalogued = AccessControlService.modules.some((item) => item.route === route);
  if (!catalogued) return false;

  const required = AccessControlService.routePermission(route);
  const wildcard = identity.permissions.includes('*');
  const adminPermission = wildcard || identity.permissions.includes('admin.manage');

  if (identity.isAdmin && !identity.isClient) return true;

  if (identity.isClient) {
    if (!validLicense(identity.license)) return false;
    const licensedModules = Array.isArray(identity.license?.modules) ? identity.license.modules.map(String) : [];
    if (!CORE.has(route) && !licensedModules.includes(route)) return false;
  }

  if (!required) return false;
  if (!identity.permissions.length) return false;
  if (!wildcard && !adminPermission && !identity.permissions.includes(required)) return false;
  if (ADMIN_SENSITIVE.has(route) && identity.isClient) return false;
  return true;
};

export function installSessionAccessGuard() {
  if (installed) return;
  installed = true;
  queueMicrotask(() => {
    const previous = AccessControlService.canAccessRoute.bind(AccessControlService);
    AccessControlService.canAccessRoute = (state, route) => {
      if (!route) return false;

      const identity = sessionAccess();
      if (identity) {
        // Cookie/demo session metadata is the only frontend navigation authority
        // once authentication exists. Local RBAC/profile state can be stale after
        // role, license or tenant changes and must never grant or veto real access.
        return canSessionAccessRoute(identity, route);
      }

      // Before authentication, preserve the existing local/demo QA behavior used
      // by login/bootstrap tooling. Production demo sessions can only be created
      // through AuthService's DEV-only VITE_ENABLE_DEMO_MODE gate.
      if (isActiveQaLicense(state, route)) return true;
      return previous(state, route);
    };
  });
}
