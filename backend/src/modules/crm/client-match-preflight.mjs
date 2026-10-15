import { normalizeLeadIdentity, assessClientConversion } from './crm-domain.mjs';

/**
 * Read-only CRM preflight against canonical Client rows.
 * A result is advisory, never permission to insert, merge or change a Client.
 */
export const CLIENT_PREFLIGHT_MAX_CANDIDATES = 200;

export function canonicalRifVariants(rif) {
  if (typeof rif !== 'string' || !/^[VEJPG][0-9]{8,10}$/.test(rif)) return [];
  const prefix = rif[0];
  const numbers = rif.slice(1);
  const body = numbers.slice(0, -1);
  const checkDigit = numbers.at(-1);
  const dottedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  // Include common legacy human-entry formats. This is still an exact,
  // bounded lookup: never broaden to fuzzy LIKE matching across taxpayers.
  return Object.freeze([...new Set([
    rif, prefix + '-' + numbers, prefix + '-' + body + '-' + checkDigit,
    prefix + '-' + dottedBody + '-' + checkDigit
  ])]);
}

/**
 * Read-only canonical Client decision; DB never authorizes client creation.
 */
export async function canonicalClientPreflight({ tenantId, lead, clientReader }) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) throw new TypeError('TENANT_REQUIRED');
  if (!lead || typeof lead !== 'object' || Array.isArray(lead)) throw new TypeError('LEAD_REQUIRED');
  if (!clientReader || typeof clientReader.findMany !== 'function') throw new TypeError('CLIENT_AUTHORITY_REQUIRED');
  const identity = normalizeLeadIdentity(lead);
  const rifProvided = typeof lead.rif === 'string' && lead.rif.trim().length > 0;
  const emailProvided = typeof lead.email === 'string' && lead.email.trim().length > 0;
  if ((rifProvided && !identity.rif) || (emailProvided && !identity.email) ||
      (!identity.rif && !identity.email)) throw new TypeError('INVALID_LEAD_IDENTITY');

  const or = [];
  if (identity.rif) or.push({ rif: { in:canonicalRifVariants(identity.rif), mode:'insensitive' } });
  if (identity.email) or.push({ email: { equals:identity.email, mode:'insensitive' } });
  // Apply tenant and active predicates inside SQL, not only after fetching.
  // Read one extra row to fail closed on truncation, never signal "clear" on a partial scan.
  const rows = await clientReader.findMany({
    where: { tenantId, active:true, OR:or },
    select: { id:true, tenantId:true, active:true, rif:true, email:true },
    orderBy: { id:'asc' },
    take: CLIENT_PREFLIGHT_MAX_CANDIDATES + 1
  });
  if (!Array.isArray(rows)) throw new TypeError('INVALID_CLIENT_AUTHORITY_RESPONSE');
  if (rows.length > CLIENT_PREFLIGHT_MAX_CANDIDATES) return Object.freeze({
    status:'BLOCKED', reason:'CANDIDATE_LIMIT_EXCEEDED', candidates:Object.freeze([]),
    reviewOnly:true, conversionAuthorized:false
  });
  const result = assessClientConversion({ tenantId, lead, clients:rows });
  return Object.freeze({
    status:result.status, reason:result.reason, candidates:Object.freeze([...result.candidates]),
    reviewOnly:true, conversionAuthorized:false
  });
}
