import { AccessControlService } from './accessControlService.js';
import { AuthSession } from './authSession.js';

let installed = false;
const CORE = new Set(['dashboard','login','profile','ayuda','soporte']);
const ADMIN_SENSITIVE = new Set(['admin','backend','configuracion','marca','modulos-madurez','pretesting','licencias','demo-control','vistas','importacion-data']);
const ADMIN_ROLES = new Set(['admin','administrator','administrador','sysadmin','superadmin']);

const normalizeRole = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const normalizePermissions = (value) => Array.isArray(value) ? value.map(String) : [];
const roleName = (role) => typeof role === 'string' ? role : (role?.key || role?.slug || role?.name || role?.id || '');

const validLicense = (license) => Boolean(
  license?.status === 'active' && (!license.expiresAt || new Date(license.expiresAt).getTime() > Date.now())
);

const isActiveQaLicense = (state, route) => {
  const license = state?.activeLicense;
  if (!license || license.qaMode !== true || !validLicense(license)) return false;
  return CORE.has(route) || (Array.isArray(license.modules) && license.modules.includes(route));
};

const profileAccess = (state = {}) => {
  const profile = state.profile || {};
  const role = normalizeRole(roleName(profile.role));
  const permissions = normalizePermissions(profile.permissions);
  const isClient = role === 'client' || role === 'cliente';
  return {
    source:'profile',
    role,
    permissions,
    isClient,
    isAdmin: !isClient && (ADMIN_ROLES.has(role) || permissions.includes('*') || permissions.includes('admin.manage'))
  };
};

const sessionAccess = () => {
  const session = AuthSession.get();
  if (!session) return null;
  const user = session.user || {};
  const role = normalizeRole(roleName(user.role || session.role));
  const permissions = normalizePermissions(user.permissions || session.permissions);
  const audience = normalizeRole(session.audience);
  const isClient = audience === 'client' || role === 'client' || role === 'cliente';
  return {
    source:'session',
    role,
    permissions,
    audience,
    isClient,
    isAdmin: !isClient && (ADMIN_ROLES.has(role) || permissions.includes('*') || permissions.includes('admin.manage'))
  };
};

/* The authenticated session is authoritative for identity. Local profile data is
   presentation state and may be stale after a role/license/tenant change. A
   client session must never inherit an old local admin profile. If a staff
   session does not expose role metadata, we may use the local profile only as a
   display/navigation fallback; backend authorization remains authoritative. */
const resolveIdentity = (state = {}) => {
  const session = sessionAccess();
  if (!session) return profileAccess(state);
  if (session.isClient || session.role || session.permissions.length) return session;
  const local = profileAccess(state);
  return { ...local, source:'session+profile-fallback', isClient:false };
};

export function installSessionAccessGuard() {
  if (installed) return;
  installed = true;
  queueMicrotask(() => {
    const previous = AccessControlService.canAccessRoute.bind(AccessControlService);
    AccessControlService.canAccessRoute = (state, route) => {
      if (!route) return false;
      const identity = resolveIdentity(state);
      const role = identity.role;
      const license = state?.activeLicense;

      // Explicit QA licenses are evaluated before stale local RBAC metadata, but
      // only for the routes actually listed in that license.
      if (isActiveQaLicense(state, route)) return true;

      // Internal staff administrators can inspect all ERP modules for QA. This
      // is navigation visibility only; API writes still require backend auth,
      // tenant context, permissions and commercial/legal gates.
      if (identity.isAdmin && !identity.isClient) return true;

      if (CORE.has(route)) return previous(state, route);

      // Commercial/client sessions are always license-scoped. Missing, expired
      // or incomplete licenses cannot be converted into access by local RBAC.
      if (identity.isClient) {
        if (!validLicense(license)) return false;
        if (!Array.isArray(license.modules) || !license.modules.includes(route)) return false;
      }

      const allowedByExistingRules = previous(state, route);
      if (!allowedByExistingRules) return false;

      const catalogued = AccessControlService.modules.some((item) => item.route === route);
      const required = catalogued ? AccessControlService.routePermission(route) : null;
      const wildcard = identity.permissions.includes('*');
      const adminPermission = wildcard || identity.permissions.includes('admin.manage');

      if (ADMIN_SENSITIVE.has(route)) {
        if (identity.isClient) return false;
        if (required === 'admin.manage' && role !== 'admin' && !identity.isAdmin && !adminPermission) return false;
        if (identity.permissions.length && required && !wildcard && !identity.permissions.includes(required) && !adminPermission) return false;
      }

      if (catalogued && identity.permissions.length && required && !wildcard && !identity.permissions.includes(required) && !adminPermission) return false;
      return true;
    };
  });
}
