import {
  assertReviewedVeRule,
  calculateReviewedVeTaxPreview,
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
