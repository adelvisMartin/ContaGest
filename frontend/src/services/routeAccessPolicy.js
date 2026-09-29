const CORE_LICENSE_ROUTES=new Set(['dashboard','profile','ayuda','soporte','login']);

function isLicenseValid(license,now){
  if(license?.status!=='active')return false;
  if(!license.expiresAt)return true;
  return new Date(license.expiresAt).getTime()>now.getTime();
}

/**
 * Client-side navigation policy only.
 * Server-side authentication/RBAC remains authoritative for protected data/actions.
 */
export function canAccessRouteWithLicensePolicy({state,route,session,canAccessByRole,now=new Date()}={}){
  if(typeof canAccessByRole!=='function')throw new TypeError('canAccessByRole is required');
  const license=state?.activeLicense;
  const validLicense=isLicenseValid(license,now);
  const modules=Array.isArray(license?.modules)?license.modules:[];
  const clientSession=session?.audience==='client';
  const qaClient=Boolean(clientSession&&license?.qaMode===true&&validLicense);

  // Preserve the historical QA-client behavior: a valid QA license owns the
  // client-side route allowlist and intentionally bypasses the local role gate.
  if(qaClient)return CORE_LICENSE_ROUTES.has(route)||modules.includes(route);

  const allowedByRole=Boolean(canAccessByRole(state,route));
  if(!allowedByRole)return false;

  // Staff/non-client sessions and client sessions without a license continue to
  // follow the existing RBAC decision without inventing an entitlement gate.
  const enforceLicense=Boolean(license&&clientSession);
  if(!enforceLicense)return true;
  if(CORE_LICENSE_ROUTES.has(route))return true;
  return validLicense&&modules.includes(route);
}

export const ROUTE_ACCESS_POLICY=Object.freeze({
  coreRoutes:Object.freeze([...CORE_LICENSE_ROUTES]),
  authority:'client-navigation-only',
});
