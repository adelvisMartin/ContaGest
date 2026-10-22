import { createHash } from 'node:crypto';
import {
  assertReviewedVeRule,
  calculateReviewedVeTaxPreview,
  resolveReviewedVeRule,
  type VeReviewedRule,
} from './ve-reviewed-rule-policy.js';

// #780. Municipality and activity are exact data selectors, never a national rate.
// No entitlement, threshold, fiscal filing or ledger effect is inferred here.
export type MunicipalEvent = Readonly<{
  tenantId: string; eventDate: string;
  municipalityCode: string; activityCode: string;
  operationKind: string; counterpartyClass: string;
  taxableBaseMinor: number;
}>;
const CODE = /^[A-Z0-9][A-Z0-9._-]{0,59}$/;
function blocked(): never { throw new Error('MUNICIPAL_RULE_SCOPE_NOT_VERIFIED'); }
export function municipalEventSelector(event: Pick<MunicipalEvent, 'municipalityCode' | 'activityCode' | 'operationKind' | 'counterpartyClass'>) {
  if (!event || !CODE.test(event.municipalityCode) ||
      !CODE.test(event.activityCode) || !CODE.test(event.operationKind) ||
      !CODE.test(event.counterpartyClass)) blocked();
  return [event.municipalityCode, event.activityCode,
    event.operationKind, event.counterpartyClass].join('|');
}
export function previewReviewedMunicipalEvent(event: MunicipalEvent, rule: VeReviewedRule) {
  if (!event || typeof event.tenantId !== 'string' || !event.tenantId.trim() ||
      !Number.isSafeInteger(event.taxableBaseMinor) || event.taxableBaseMinor < 0) blocked();
  const selector = municipalEventSelector(event);
  const reviewed = assertReviewedVeRule(rule);
  if (reviewed.family !== 'MUNICIPAL' || reviewed.tenantId !== event.tenantId ||
      reviewed.selector !== selector) blocked();
  const snapshot = calculateReviewedVeTaxPreview(reviewed, {
    tenantId: event.tenantId, eventDate: event.eventDate, baseMinor: event.taxableBaseMinor,
  });
  return Object.freeze({
    tenantId: event.tenantId, eventDate: event.eventDate,
    municipalityCode: event.municipalityCode, activityCode: event.activityCode,
    operationKind: event.operationKind, counterpartyClass: event.counterpartyClass,
    baseMinor: event.taxableBaseMinor, taxMinor: snapshot.taxMinor,
    ruleSnapshot: snapshot, mode: 'NON_POSTING_PREVIEW' as const,
  });
}

/** #780: catalog-level preview. Never silently pick the first of overlapping rules.
 * Caller must load the full reviewed tenant-scoped catalog from server authority. */
export function previewReviewedMunicipalEventFromCatalog(
  event: MunicipalEvent, reviewedCatalog: readonly VeReviewedRule[],
) {
  if (!event || typeof event.tenantId !== 'string' || !event.tenantId.trim() ||
      !Number.isSafeInteger(event.taxableBaseMinor) || event.taxableBaseMinor < 0 ||
      !Array.isArray(reviewedCatalog)) blocked();
  const selector = municipalEventSelector(event);
  const uniqueRule = resolveReviewedVeRule(reviewedCatalog, {
    tenantId: event.tenantId, family: 'MUNICIPAL', selector, eventDate: event.eventDate,
  });
  return previewReviewedMunicipalEvent(event, uniqueRule);
}

/** Inert, replayable period evidence for approved municipal rule previews.
 * Must not be interpreted as a filed obligation, source invoice or GL posting. */
export function previewReviewedMunicipalPeriodFromCatalog(
  input: Readonly<{ tenantId: string; period: string;
    events: readonly (MunicipalEvent & Readonly<{ eventId: string }>)[] }>,
  catalog: readonly VeReviewedRule[],
) {
  if (!input || typeof input.tenantId !== 'string' || !input.tenantId.trim() ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period) ||
      !Array.isArray(input.events) || input.events.length < 1 || input.events.length > 500 ||
      !Array.isArray(catalog)) blocked();
  const seen = new Set<string>();
  let base = 0n, tax = 0n;
  const events = input.events.map(event => {
    if (!event || event.tenantId !== input.tenantId ||
        typeof event.eventId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(event.eventId) ||
        seen.has(event.eventId) || typeof event.eventDate !== 'string' ||
        event.eventDate.slice(0, 7) !== input.period) blocked();
    seen.add(event.eventId);
    // A monthly aggregate has one municipal jurisdiction and activity scope.
    // Separate scopes must be evaluated independently, never silently merged.
    if (event.municipalityCode !== input.events[0].municipalityCode ||
        event.activityCode !== input.events[0].activityCode) blocked();
    const preview = previewReviewedMunicipalEventFromCatalog(event, catalog);
    base += BigInt(preview.baseMinor); tax += BigInt(preview.taxMinor);
    if (base > BigInt(Number.MAX_SAFE_INTEGER) || tax > BigInt(Number.MAX_SAFE_INTEGER)) blocked();
    return Object.freeze({ eventId: event.eventId, ruleSnapshot: preview.ruleSnapshot,
      municipalityCode: preview.municipalityCode, activityCode: preview.activityCode,
      operationKind: preview.operationKind, counterpartyClass: preview.counterpartyClass });
  }).sort((a, b) => a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0);
  const evidenceSha256 = createHash('sha256').update(JSON.stringify({
    tenantId: input.tenantId, period: input.period, events,
  }), 'utf8').digest('hex');
  return Object.freeze({
    tenantId: input.tenantId, period: input.period,
    municipalityCode: input.events[0].municipalityCode, activityCode: input.events[0].activityCode,
    eventCount: events.length,
    baseMinor: Number(base), taxMinor: Number(tax), evidenceSha256,
    events: Object.freeze(events), mode: 'NON_POSTING_PREVIEW' as const,
  });
}
