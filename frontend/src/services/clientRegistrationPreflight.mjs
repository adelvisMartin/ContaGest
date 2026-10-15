/**
 * #760. Client registration review is advisory. Only the canonical server
 * POST /clients transaction may create a customer after this preflight.
 * This module never stores PII, caches verdicts, or attempts a local fallback.
 */
const MESSAGES = Object.freeze({
  REVIEW_NEW: 'No se encontraron coincidencias en la revisión inicial. El servidor volverá a validar el registro.',
  REVIEW_EXISTING: 'Ya existe un cliente relacionado. Revísalo en el directorio antes de registrar otro.',
  AMBIGUOUS_CLIENT_MATCH: 'Existen varios clientes relacionados. No se puede registrar hasta resolver la coincidencia.',
  CONFLICTING_RIF_EMAIL: 'El correo coincide con otro contribuyente de RIF diferente. Revisa los datos fiscales.',
  UNVERIFIABLE_CLIENT_RIF: 'Existe un cliente con identidad fiscal pendiente de verificación.',
  CANDIDATE_LIMIT_EXCEEDED: 'Demasiados posibles candidatos; solicita revisión administrativa.',
  CLIENT_RIF_REQUIRED: 'Se requiere un RIF válido para registrar un cliente.',
  PREFLIGHT_UNAVAILABLE: 'No se pudo verificar la identidad con el servidor. No se guardó ningún cliente.',
  PREFLIGHT_INVALID: 'El servidor devolvió una verificación incompleta. No se guardó ningún cliente.'
});

export function decideClientRegistrationPreflight(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result) ||
      result.reviewOnly !== true || result.conversionAuthorized !== false ||
      !Array.isArray(result.candidates) ||
      result.candidates.some(id => typeof id !== 'string' || !id)) {
    return Object.freeze({ maySubmit:false, reason:'PREFLIGHT_INVALID', message:MESSAGES.PREFLIGHT_INVALID });
  }
  const success = result.status === 'REVIEW_NEW' &&
    result.reason === 'NO_EXISTING_CLIENT_MATCH' && result.candidates.length === 0;
  if (success) return Object.freeze({ maySubmit:true, reason:'REVIEW_NEW', message:MESSAGES.REVIEW_NEW });
  const blockedReasons = new Set([
    'AMBIGUOUS_CLIENT_MATCH', 'CONFLICTING_RIF_EMAIL',
    'UNVERIFIABLE_CLIENT_RIF', 'CANDIDATE_LIMIT_EXCEEDED', 'CLIENT_RIF_REQUIRED'
  ]);
  const code = result.status === 'REVIEW_EXISTING' &&
      result.reason === 'EXISTING_CLIENT_AUTHORITY' && result.candidates.length > 0
    ? 'REVIEW_EXISTING'
    : result.status === 'BLOCKED' && blockedReasons.has(result.reason)
      ? result.reason : 'PREFLIGHT_INVALID';
  return Object.freeze({ maySubmit:false, reason:code, message:MESSAGES[code] });
}

/** The requester is the existing BackendApi.post, with cookie + CSRF/session. */
export async function checkClientRegistrationBeforeSave(data, requester) {
  if (!data || typeof data !== 'object' || typeof requester !== 'function') {
    return Object.freeze({ maySubmit:false, reason:'PREFLIGHT_INVALID', message:MESSAGES.PREFLIGHT_INVALID });
  }
  const rif = String(data.rif || '').trim();
  const email = String(data.email || '').trim();
  if (!rif || rif.length > 40 || email.length > 254) {
    return Object.freeze({ maySubmit:false, reason:'CLIENT_RIF_REQUIRED', message:MESSAGES.CLIENT_RIF_REQUIRED });
  }
  try {
    const server = await requester('/clients/preflight', {rif, ...(email ? {email} : {})});
    return decideClientRegistrationPreflight(server);
  } catch {
    // Auth/transport/timeouts/429 must never trigger offline Client fallback.
    return Object.freeze({ maySubmit:false, reason:'PREFLIGHT_UNAVAILABLE', message:MESSAGES.PREFLIGHT_UNAVAILABLE });
  }
}
