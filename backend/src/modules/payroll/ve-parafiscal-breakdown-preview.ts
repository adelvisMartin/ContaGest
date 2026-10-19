import {
  assertReviewedVeRule,
  calculateReviewedVeTaxPreview,
  type VeReviewedRule,
} from '../fiscal/ve-reviewed-rule-policy.js';

// #781. Preview over *externally reviewed* rules, not a second payroll engine.
// Legal applicability, each contribution base/cap and source must be approved first.
export type ParafiscalSide = 'WORKER' | 'EMPLOYER';
export type ParafiscalComponent = Readonly<{
  side: ParafiscalSide; rule: VeReviewedRule; baseMinor: number;
}>;
export type ParafiscalPayrollEvent = Readonly<{
  tenantId: string; eventDate: string; payrollPeriod: string;
  employeeId: string; payrollClass: string; riskClass: string;
  grossMinor: number;
}>;
const ID = /^[A-Z0-9][A-Z0-9_-]{0,59}$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const FAMILIES = new Set(['FAOV', 'IVSS', 'INCES']);
const failed = (): never => { throw new Error('PAYROLL_PARAFISCAL_SCOPE_UNVERIFIED'); };
const safe = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
export function parafiscalRuleSelector(event: Pick<ParafiscalPayrollEvent, 'payrollClass' | 'riskClass'>, side: ParafiscalSide) {
  if (!event || !ID.test(event.payrollClass) || !ID.test(event.riskClass) ||
      (side !== 'WORKER' && side !== 'EMPLOYER')) failed();
  return [event.payrollClass, event.riskClass, side].join('|');
}
export function previewReviewedPayrollContributions(
  event: ParafiscalPayrollEvent,
  components: readonly ParafiscalComponent[],
) {
  if (!event || typeof event.tenantId !== 'string' || !event.tenantId.trim() ||
      typeof event.employeeId !== 'string' || !event.employeeId.trim() ||
      !PERIOD.test(event.payrollPeriod) || !safe(event.grossMinor) ||
      !Array.isArray(components) || components.length < 1 || components.length > 6) failed();
  const snapshots: Array<Readonly<{ side: ParafiscalSide; family: string; baseMinor: number; taxMinor: number; ruleSnapshot: ReturnType<typeof calculateReviewedVeTaxPreview> }>> = [];
  const used = new Set<string>();
  let worker = 0n, employer = 0n;
  for (const component of components) {
    if (!component || !safe(component.baseMinor) || component.baseMinor > event.grossMinor) failed();
    const selector = parafiscalRuleSelector(event, component.side);
    const rule = assertReviewedVeRule(component.rule);
    const key = rule.family + ':' + component.side;
    if (!FAMILIES.has(rule.family) || used.has(key) || rule.tenantId !== event.tenantId ||
        rule.selector !== selector) failed();
    used.add(key);
    const snapshot = calculateReviewedVeTaxPreview(rule, {
      tenantId: event.tenantId, eventDate: event.eventDate, baseMinor: component.baseMinor,
    });
    const amount = BigInt(snapshot.taxMinor);
    if (component.side === 'WORKER') worker += amount;
    else employer += amount;
    snapshots.push(Object.freeze({ side: component.side, family: rule.family,
      baseMinor: component.baseMinor, taxMinor: snapshot.taxMinor, ruleSnapshot: snapshot }));
  }
  if (worker > BigInt(event.grossMinor) || employer > BigInt(Number.MAX_SAFE_INTEGER)) failed();
  return Object.freeze({
    tenantId: event.tenantId, employeeId: event.employeeId,
    payrollPeriod: event.payrollPeriod, eventDate: event.eventDate,
    workerDeductionsMinor: Number(worker), employerContributionsMinor: Number(employer),
    workerAfterContributionsMinor: event.grossMinor - Number(worker),
    components: Object.freeze(snapshots), mode: 'NON_POSTING_PREVIEW' as const,
  });
}
