/**
 * #760 — UI adapter for existing canonical CRM Lead API.
 * This module never creates/duplicates Clients and never persists prospect PII locally.
 */
export const CRM_LEADS_ENDPOINT = '/modules/crm/leads';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const field = (value, max) => {
  if (value == null) return '';
  if (typeof value !== 'string') throw new TypeError('CRM_LEAD_INVALID_INPUT');
  const result = value.trim();
  if (result.length > max) throw new TypeError('CRM_LEAD_INVALID_INPUT');
  return result;
};

export function normalizeCrmLeadDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('CRM_LEAD_INVALID_INPUT');
  const name = field(input.name, 180);
  const rif = field(input.rif, 40);
  const email = field(input.email, 254);
  const phone = field(input.phone, 60);
  const notes = field(input.notes, 2000);
  if (name.length < 2 || (!rif && !email)) throw new TypeError('CRM_LEAD_NAME_OR_CONTACT_REQUIRED');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TypeError('CRM_LEAD_INVALID_EMAIL');
  return Object.freeze({ name, ...(rif ? {rif} : {}), ...(email ? {email} : {}),
    ...(phone ? {phone} : {}), ...(notes ? {notes} : {}) });
}

/**
 * Retries with the same normalized draft reuse the same key after network errors.
 * The server owns the tenant, actor, transaction, audit and PK uniqueness.
 */
export function createCrmLeadService({ api, uuidFactory = () => globalThis.crypto?.randomUUID?.() }) {
  if (!api || typeof api.get !== 'function' || typeof api.request !== 'function') throw new TypeError('CRM_API_REQUIRED');
  let pending = null;
  return Object.freeze({
    async list() {
      const result = await api.get(`${CRM_LEADS_ENDPOINT}?take=50&skip=0`);
      if (!Array.isArray(result)) throw new TypeError('CRM_LEADS_INVALID_RESPONSE');
      return result;
    },
    async create(input) {
      const body = normalizeCrmLeadDraft(input);
      const signature = JSON.stringify(body);
      if (!pending || pending.signature !== signature) {
        const key = uuidFactory();
        if (typeof key !== 'string' || !UUID_V4.test(key)) throw new TypeError('CRM_SECURE_UUID_REQUIRED');
        pending = { signature, key };
      }
      const attempt = pending;
      const data = await api.request(CRM_LEADS_ENDPOINT, {
        method:'POST', body, headers:{'Idempotency-Key': attempt.key}
      });
      if (!data || typeof data !== 'object' || typeof data.id !== 'string') {
        throw new TypeError('CRM_LEAD_INVALID_CREATE_RESPONSE');
      }
      if (pending === attempt) pending = null;
      return data;
    }
  });
}
