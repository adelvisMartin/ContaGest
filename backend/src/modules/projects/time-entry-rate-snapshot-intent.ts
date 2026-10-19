/**
 * #761: deterministic hourly-rate snapshot *intent* for reviewed project time.
 * No authentication, persistence, fiscal rounding, SalesInvoice or ledger effect.
 * Both the review principal and rate quote MUST be loaded by server authority.
 */
import { normalizeProjectTimePeriod, type ProjectTimePeriodInput } from './time-entry-period.js';
import { prepareProjectTimeReviewIntent, type ProjectTimeReviewInput } from './time-entry-review-intent.js';

export const PROJECT_TIME_RATE_SNAPSHOT_INTENT_VERSION = 'project-time-rate-snapshot-intent-v1';

export type ProjectTimeRateQuote = {
  tenantId: string;
  clientId: string;
  projectId: string;
  rateCardId: string;
  rateCardRevision: number;
  hourlyRateExact: string;
  currency: string;
  effectiveFromUtc: string;
};
export type ProjectTimeRateSnapshotInput = {
  period: ProjectTimePeriodInput;
  review: ProjectTimeReviewInput;
  quote: ProjectTimeRateQuote;
  /** Set by the trusted server clock, not by a client's request body. */
  capturedAtUtc: string;
};

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const EXACT_RATE = /^([0-9]{1,12})\.([0-9]{2})$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function canonicalUtcInstant(value: unknown): number {
  if (typeof value !== 'string' || !ISO_UTC.test(value)) {
    throw new TypeError('PROJECT_TIME_RATE_TIMESTAMP_INVALID');
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value) {
    throw new TypeError('PROJECT_TIME_RATE_TIMESTAMP_INVALID');
  }
  return millis;
}

/**
 * The returned rational amount is informational only: cents numerator / 60.
 * No currency rounding policy has been approved for fractional cents.
 */
export function prepareProjectTimeRateSnapshotIntent(input: ProjectTimeRateSnapshotInput) {
  if (!input || typeof input !== 'object' || !input.quote || typeof input.quote !== 'object') {
    throw new TypeError('PROJECT_TIME_RATE_QUOTE_INVALID');
  }
  // A non-approve action must never be used for a billable-rate proposal.
  if (input.review?.action !== 'approve') {
    throw new TypeError('PROJECT_TIME_RATE_APPROVAL_REQUIRED');
  }
  // Reuse the canonical earlier gates rather than trusting a copied DTO.
  const period = normalizeProjectTimePeriod(input.period);
  const review = prepareProjectTimeReviewIntent(input.review);
  if (review.action !== 'approve' || review.proposedState !== 'approved') {
    throw new TypeError('PROJECT_TIME_RATE_APPROVAL_REQUIRED');
  }
  const quote = input.quote;
  for (const id of [quote.tenantId, quote.clientId, quote.projectId, quote.rateCardId]) {
    if (typeof id !== 'string' || !IDENTIFIER.test(id)) {
      throw new TypeError('PROJECT_TIME_RATE_QUOTE_INVALID');
    }
  }
  if (quote.tenantId !== period.tenantId || quote.tenantId !== review.tenantId ||
      quote.clientId !== period.clientId || quote.projectId !== period.projectId ||
      quote.projectId !== review.projectId || review.entryId !== input.review.entry.id ||
      input.review.entry.memberId !== period.memberId) {
    throw new TypeError('PROJECT_TIME_RATE_SCOPE_MISMATCH');
  }
  if (!Number.isSafeInteger(quote.rateCardRevision) || quote.rateCardRevision < 1) {
    throw new TypeError('PROJECT_TIME_RATE_REVISION_INVALID');
  }
  if (typeof quote.currency !== 'string' || !/^[A-Z]{3}$/.test(quote.currency)) {
    throw new TypeError('PROJECT_TIME_RATE_CURRENCY_INVALID');
  }
  const match = typeof quote.hourlyRateExact === 'string'
    ? EXACT_RATE.exec(quote.hourlyRateExact) : null;
  if (!match) throw new TypeError('PROJECT_TIME_RATE_DECIMAL_INVALID');
  const minorPerHour = BigInt(match[1]) * 100n + BigInt(match[2]);
  if (minorPerHour <= 0n) throw new TypeError('PROJECT_TIME_RATE_DECIMAL_INVALID');
  const captured = canonicalUtcInstant(input.capturedAtUtc);
  const effective = canonicalUtcInstant(quote.effectiveFromUtc);
  if (effective > captured) throw new TypeError('PROJECT_TIME_RATE_NOT_YET_EFFECTIVE');
  // A tariff published during a shift cannot be applied retroactively to
  // the shift's earlier minutes. Splitting between revisions needs explicit
  // accounting policy and a trusted version-history lookup upstream.
  if (effective > Date.parse(period.startedAtUtc)) {
    throw new TypeError('PROJECT_TIME_RATE_EFFECTIVE_AFTER_START');
  }
  // Server capture cannot precede the end of the time being reviewed.
  if (captured < Date.parse(period.endedAtUtc)) {
    throw new TypeError('PROJECT_TIME_RATE_CAPTURE_BEFORE_END');
  }

  // All integer arithmetic. No IEEE-754 monetary values, implicit rounding,
  // invoice lines, tax or ledger mutations are produced by this helper.
  const numerator = minorPerHour * BigInt(period.durationMinutes);
  const divisor = 60n;
  const exact = numerator % divisor === 0n;
  return Object.freeze({
    version: PROJECT_TIME_RATE_SNAPSHOT_INTENT_VERSION,
    tenantId: period.tenantId,
    clientId: period.clientId,
    projectId: period.projectId,
    memberId: period.memberId,
    entryId: review.entryId,
    approvalExpectedRevision: review.expectedRevision,
    approvalProposedRevision: review.proposedRevision,
    rateCardId: quote.rateCardId,
    rateCardRevision: quote.rateCardRevision,
    rateEffectiveFromUtc: quote.effectiveFromUtc,
    capturedAtUtc: input.capturedAtUtc,
    currency: quote.currency,
    hourlyRateExact: `${BigInt(match[1]).toString()}.${match[2]}`,
    durationMinutes: period.durationMinutes,
    proratedMinorUnitNumerator: numerator.toString(),
    proratedMinorUnitDenominator: '60',
    exactMinorUnits: exact ? (numerator / divisor).toString() : null,
    requiresExplicitRoundingPolicy: !exact,
    persisted: false as const,
    approvedInDatabase: false as const,
    billableAuthorized: false as const,
    invoiceAuthorized: false as const
  });
}
