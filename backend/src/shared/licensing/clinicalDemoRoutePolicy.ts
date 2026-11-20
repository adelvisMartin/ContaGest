/**
 * #1362: The canonical manifest intentionally gives Care, Dentistry and Vet
 * the shared 'health.manage' permission. Permission alone is therefore not a
 * sufficient licence entitlement for a trial/demo HTTP route.
 *
 * This guard is a boundary between vertical route families, not a substitute
 * for clinical record ownership, patient/guardian consent or staff RBAC.
 */
export function clinicalDemoRouteAllowed(
  permission: string,
  modules: readonly string[],
  originalUrl: string,
): boolean {
  if (permission !== 'health.manage') return true;
  const path = originalUrl.split('?')[0];
  if (/^\/api\/v1\/verticals\/veterinary(?:\/|$)/.test(path)) {
    return modules.includes('veterinaria');
  }
  if (/^\/api\/v1\/verticals\/health(?:\/|$)/.test(path)) {
    return modules.includes('salud') || modules.includes('odontologia');
  }
  // Clinical endpoints added under another prefix require an explicit owner
  // review before becoming reachable from a trial/demo licence.
  return false;
}
