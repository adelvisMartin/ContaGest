/**
 * #760 CRM-domain pre-persistence contract.
 * No SQL, Client mutation, quote creation or LLM scoring occurs here.
 * All inputs are untrusted; callers remain responsible for tenant/RBAC enforcement.
 */
const STAGES = Object.freeze(['new', 'qualified', 'proposal', 'won', 'lost']);
const EDGES = Object.freeze({
  new: ['qualified', 'lost'],
  qualified: ['proposal', 'lost'],
  proposal: ['won', 'lost'],
  won: [],
  lost: []
});
const CURRENCY = /^[A-Z]{3}$/;
const DECIMAL = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

const clean = (value, max=120) => {
  if (value == null) return '';
  if (typeof value !== 'string') throw new TypeError('Expected a string');
  const normalized = value.trim();
  if (normalized.length > max) throw new RangeError('Input exceeds limit');
  return normalized;
};

export function normalizeLeadIdentity(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Identity must be an object');
  const rawRif = clean(input.rif, 40).toUpperCase().replace(/[.\s-]/g, '');
  const rif = rawRif && /^[VEJPG][0-9]{8,10}$/.test(rawRif) ? rawRif : null;
  const emailRaw = clean(input.email, 254).toLowerCase();
  const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
  // Phone and name never create an automatic match; they are insufficient identities.
  return Object.freeze({rif, email});
}

/** Returns IDs only; never copies a Client's PII into the conversion response. */
export function findClientDuplicateCandidates({tenantId, lead, clients}) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) throw new TypeError('Tenant is required');
  if (!Array.isArray(clients)) throw new TypeError('Client candidates must be a list');
  const identity = normalizeLeadIdentity(lead);
  const ids = new Set();
  for (const client of clients) {
    if (!client || client.tenantId !== tenantId || client.active === false) continue;
    if (typeof client.id !== 'string' || !client.id) continue;
    const existing = normalizeLeadIdentity(client);
    if ((identity.rif && identity.rif === existing.rif) ||
        (identity.email && identity.email === existing.email)) ids.add(client.id);
  }
  return Object.freeze([...ids].sort());
}

/** Fail closed. A possible match must be reconciled by authorized human/API flow. */
export function assessClientConversion({tenantId, lead, clients}) {
  const identity = normalizeLeadIdentity(lead);
  const candidates = findClientDuplicateCandidates({tenantId, lead, clients});
  // Preserve the historical contract for multiple Client candidates.
  if (candidates.length > 1) return Object.freeze({status:'BLOCKED', reason:'AMBIGUOUS_CLIENT_MATCH', candidates});
  // RIF is the legal identity authority. An email-only match with an
  // unreadable historical Client RIF must also fail closed: absence of a
  // *valid* existing RIF is not evidence of the same taxpayer.
  // This is advisory only: actual conversion still needs tenant RBAC + DB CAS.
  if (identity.rif && identity.email) {
    const unverifiable = clients.filter(client => {
      if (!client || client.tenantId !== tenantId || client.active === false ||
          typeof client.id !== 'string' || !client.id) return false;
      const existing = normalizeLeadIdentity(client);
      return existing.email === identity.email && existing.rif === null;
    }).map(client => client.id);
    if (unverifiable.length) {
      return Object.freeze({
        status:'BLOCKED', reason:'UNVERIFIABLE_CLIENT_RIF',
        candidates:Object.freeze([...new Set([...candidates, ...unverifiable])].sort())
      });
    }
    const conflicting = clients.filter(client => {
      if (!client || client.tenantId !== tenantId || client.active === false ||
          typeof client.id !== 'string' || !client.id) return false;
      const existing = normalizeLeadIdentity(client);
      return existing.email === identity.email &&
        existing.rif !== null && existing.rif !== identity.rif;
    }).map(client => client.id);
    if (conflicting.length) {
      return Object.freeze({
        status:'BLOCKED', reason:'CONFLICTING_RIF_EMAIL',
        candidates:Object.freeze([...new Set([...candidates, ...conflicting])].sort())
      });
    }
  }
  if (candidates.length === 1) return Object.freeze({status:'REVIEW_EXISTING', reason:'EXISTING_CLIENT_AUTHORITY', candidates});
  if (!identity.rif) return Object.freeze({status:'BLOCKED', reason:'CLIENT_RIF_REQUIRED', candidates});
  return Object.freeze({status:'REVIEW_NEW', reason:'NO_EXISTING_CLIENT_MATCH', candidates});
}

export function transitionOpportunity(current, next) {
  if (!STAGES.includes(current) || !STAGES.includes(next)) throw new TypeError('Unknown CRM stage');
  if (!EDGES[current].includes(next)) throw new Error('INVALID_CRM_STAGE_TRANSITION');
  return next;
}

export function amountToMinorUnits(amount) {
  if (typeof amount !== 'string' || !DECIMAL.test(amount)) throw new TypeError('Use a positive fixed-scale money string (18,2)');
  const [whole, fractional=''] = amount.split('.');
  return BigInt(whole) * 100n + BigInt((fractional+'00').slice(0,2));
}

export function minorUnitsToAmount(value) {
  if (typeof value !== 'bigint' || value < 0n) throw new TypeError('Expected nonnegative minor units');
  const s = (value%100n).toString().padStart(2,'0');
  return `${value/100n}.${s}`;
}

export function forecastByCurrency({tenantId, opportunities}) {
  if (!tenantId || typeof tenantId !== 'string') throw new TypeError('Tenant is required');
  if (!Array.isArray(opportunities)) throw new TypeError('Opportunity list is required');
  const totals = new Map();
  for (const row of opportunities) {
    if (!row || row.tenantId !== tenantId) throw new Error('CROSS_TENANT_FORECAST_DENIED');
    if (!STAGES.includes(row.stage)) throw new TypeError('Unknown CRM stage');
    const currency = row.currency;
    if (typeof currency !== 'string' || !CURRENCY.test(currency)) throw new TypeError('Invalid currency');
    const probability = row.probability;
    if (!Number.isInteger(probability) || probability < 0 || probability > 100) throw new TypeError('Probability must be an integer from 0 to 100');
    const minor = amountToMinorUnits(row.expectedValue);
    if (row.stage === 'lost') continue;
    // Keep fractional minor units until the currency total is complete.
    // Rounding per opportunity overstates many tiny deals (e.g. 100 x 0.01 at 50%).
    // Won opportunities are realized pipeline value, regardless of stale probability.
    const effectiveProbability = row.stage === 'won' ? 100 : probability;
    const weightedNumerator = minor * BigInt(effectiveProbability);
    const before = totals.get(currency) ?? {gross:0n, weightedNumerator:0n, count:0};
    totals.set(currency, {
      gross:before.gross+minor,
      weightedNumerator:before.weightedNumerator+weightedNumerator,
      count:before.count+1
    });
  }
  return Object.freeze([...totals.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,x])=>Object.freeze({
    currency, count:x.count, gross:minorUnitsToAmount(x.gross), weighted:minorUnitsToAmount((x.weightedNumerator + 50n) / 100n)
  })));
}

// A deterministic, persistence-free intent for an atomic stage update.
// The caller MUST authorize the actor and run CAS(version) + unique(eventId)
// + append activity in a single tenant-scoped PostgreSQL transaction.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId = value => typeof value === 'string' && UUID.test(value);
const validVersion = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;

/** Pure transition planner: does NOT persist or authorize the write. */
export function planOpportunityStageChange({
  tenantId, opportunity, expectedVersion, nextStage, actorId,
  eventId, occurredAt, seenEventIds = []
}) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) throw new TypeError('Tenant is required');
  if (!opportunity || opportunity.tenantId !== tenantId) throw new Error('CROSS_TENANT_STAGE_CHANGE_DENIED');
  if (!validId(opportunity.id) || !validId(actorId) || !validId(eventId)) throw new TypeError('Invalid CRM identifier');
  if (!validVersion(opportunity.version) || !validVersion(expectedVersion)) throw new TypeError('Invalid CRM version');
  if (opportunity.version !== expectedVersion) throw new Error('STALE_CRM_OPPORTUNITY_VERSION');
  if (!Array.isArray(seenEventIds) || seenEventIds.some(id => !validId(id))) throw new TypeError('Invalid event history');
  if (seenEventIds.some(id => id.toLowerCase() === eventId.toLowerCase())) throw new Error('DUPLICATE_CRM_EVENT_ID');
  if (typeof occurredAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(occurredAt) ||
      !Number.isFinite(Date.parse(occurredAt)) ||
      new Date(occurredAt).toISOString() !== occurredAt) throw new TypeError('Invalid server timestamp');
  const to = transitionOpportunity(opportunity.stage, nextStage);
  const version = expectedVersion + 1;
  const next = Object.freeze({...opportunity, stage:to, version});
  const activity = Object.freeze({
    id:eventId, tenantId, opportunityId:opportunity.id, actorId,
    type:'CRM_STAGE_TRANSITION', from:opportunity.stage, to, version, occurredAt
  });
  return Object.freeze({next, activity});
}
