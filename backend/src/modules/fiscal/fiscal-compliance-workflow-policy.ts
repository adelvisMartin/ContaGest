/** #783: audited internal/external-evidence lifecycle.
 * Never equate a self-reported filing receipt with official e-filing integration. */
export type ComplianceAction = 'REVIEW' | 'RECORD_EXTERNAL_FILING' | 'LINK_BANK_PAYMENT' | 'CONFIRM_RECONCILIATION';
export type ComplianceStatus = 'draft' | 'reviewed' | 'filed_externally' | 'paid' | 'reconciled';
const transitions: Readonly<Record<ComplianceAction, Readonly<{ from: ComplianceStatus; to: ComplianceStatus }>>> = Object.freeze({
  REVIEW: { from: 'draft', to: 'reviewed' },
  RECORD_EXTERNAL_FILING: { from: 'reviewed', to: 'filed_externally' },
  LINK_BANK_PAYMENT: { from: 'filed_externally', to: 'paid' },
  CONFIRM_RECONCILIATION: { from: 'paid', to: 'reconciled' },
});
const reject = (): never => { throw new Error('COMPLIANCE_TRANSITION_NOT_AUTHORIZED'); };
const SHA = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;

export function assertComplianceTransition(
  current: string, action: ComplianceAction, actor: string, evidence: Readonly<Record<string, unknown>>,
  clock: Date = new Date(),
) {
  if (!actor || typeof actor !== 'string' || !transitions[action] ||
      !evidence || typeof evidence !== 'object' || Array.isArray(evidence) ||
      !Number.isFinite(clock.getTime()) ||
      current !== transitions[action].from) reject();
  const fields: Record<ComplianceAction, readonly string[]> = {
    REVIEW: ['legalSourceId', 'legalSourceHash', 'reason'],
    RECORD_EXTERNAL_FILING: ['authority', 'receiptReference', 'receiptSha256', 'filedAt'],
    LINK_BANK_PAYMENT: ['bankMovementId', 'ledgerEntryId', 'amountExact', 'currency'],
    CONFIRM_RECONCILIATION: ['bankMovementId', 'ledgerEntryId', 'amountExact', 'currency'],
  };
  const keys = fields[action];
  if (Object.keys(evidence).sort().join('|') !== [...keys].sort().join('|') ||
      keys.some(k => typeof evidence[k] !== 'string' || !(evidence[k] as string).trim() ||
        (evidence[k] as string).length > 240)) reject();
  if (action === 'REVIEW' && (!SHA.test(evidence.legalSourceHash as string) ||
      (evidence.reason as string).length < 15)) reject();
  if (action === 'RECORD_EXTERNAL_FILING') {
    const at = evidence.filedAt as string;
    if (!SHA.test(evidence.receiptSha256 as string) || !DATE.test(at) ||
        !Number.isFinite(Date.parse(at)) || new Date(at).toISOString().slice(0, 19) !== at.slice(0, 19) ||
        Date.parse(at) > clock.getTime() + 60_000 ||
        (evidence.receiptReference as string).length < 4) reject();
  }
  if ((action === 'LINK_BANK_PAYMENT' || action === 'CONFIRM_RECONCILIATION') &&
      (evidence.currency !== 'VES' ||
      !/^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(evidence.amountExact as string) ||
      evidence.amountExact === '0.00')) reject();
  return Object.freeze({
    from: current as ComplianceStatus, to: transitions[action].to,
    action, actor, occurredAt: clock.toISOString(), evidence: Object.freeze({ ...evidence }),
  });
}
