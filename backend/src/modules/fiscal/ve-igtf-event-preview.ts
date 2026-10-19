import {
  assertReviewedVeRule,
  calculateReviewedVeTaxPreview,
  type VeReviewedRule,
} from './ve-reviewed-rule-policy.js';

// #778. Event identities must originate from authenticated server-owned facts.
// This pure preview is never authorization to assess, charge or post IGTF.
export type IgtfEvent = Readonly<{
  tenantId: string;
  eventDate: string;
  currency: string;
  paymentMethod: string;
  operationKind: string;
  taxpayerCategory: string;
  baseMinor: number;
}>;

const TOKEN = /^[A-Z0-9][A-Z0-9_-]{0,39}$/;
const INVALID = 'IGTF_EVENT_NOT_AUTHORIZED';
function fail(): never { throw new Error(INVALID); }

export function igtfEventSelector(event: Pick<IgtfEvent, 'currency' | 'paymentMethod' | 'operationKind' | 'taxpayerCategory'>) {
  if (!event || !/^[A-Z]{3}$/.test(event.currency) ||
      !TOKEN.test(event.paymentMethod) || !TOKEN.test(event.operationKind) ||
      !TOKEN.test(event.taxpayerCategory)) fail();
  return [event.currency, event.paymentMethod, event.operationKind, event.taxpayerCategory].join('|');
}

export function previewReviewedIgtfEvent(event: IgtfEvent, rule: VeReviewedRule) {
  if (!event || typeof event.tenantId !== 'string' || !event.tenantId.trim() ||
      !Number.isSafeInteger(event.baseMinor) || event.baseMinor < 0) fail();
  const selector = igtfEventSelector(event);
  const reviewed = assertReviewedVeRule(rule);
  if (reviewed.family !== 'IGTF' || reviewed.tenantId !== event.tenantId ||
      reviewed.selector !== selector) fail();
  const snapshot = calculateReviewedVeTaxPreview(reviewed, {
    tenantId: event.tenantId, eventDate: event.eventDate, baseMinor: event.baseMinor,
  });
  return Object.freeze({
    tenantId: event.tenantId, eventDate: event.eventDate, selector,
    baseMinor: event.baseMinor, taxMinor: snapshot.taxMinor,
    snapshot, mode: 'NON_POSTING_PREVIEW' as const,
  });
}
