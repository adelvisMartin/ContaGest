import { createHash } from 'node:crypto';
import {
  calculateReviewedVeTaxPreview,
  resolveReviewedVeRule,
  type VeReviewedRule,
} from './ve-reviewed-rule-policy.ts';

/**
 * #781: read-only payroll contribution preview, not an obligation, legal rate,
 * payroll settlement, accounting entry, withholding or reporting authority.
 * Reviewed fiscal rules (#751) are the only source for monetary calculations.
 */
export const VE_PAYROLL_CONTRIBUTION_FAMILIES = Object.freeze(['FAOV', 'IVSS', 'INCES'] as const);
export type VePayrollContributionFamily = typeof VE_PAYROLL_CONTRIBUTION_FAMILIES[number];
export type VePayrollContributionSide = 'EMPLOYEE' | 'EMPLOYER';

export type VePayrollContributionInput = Readonly<{
  tenantId: string;
  payrollRunId: string;
  employeeId: string;
  eventDate: string; // UTC calendar date; checked by canonical reviewed-rule authority
  family: VePayrollContributionFamily;
  side: VePayrollContributionSide;
  selector: string; // reviewed category, risk/period discriminator; never an inferred legal rule
  baseMinor: number; // integer safe minor units; computed by the payroll authority
}>;

function fail(): never { throw new Error('VE_PAYROLL_CONTRIBUTION_NOT_AUTHORIZED'); }
function id(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

/** Pure and deterministic: NEVER creates or updates an official payroll or ledger record. */
export function previewVePayrollContribution(
  rules: readonly VeReviewedRule[],
  input: VePayrollContributionInput,
) {
  if (!Array.isArray(rules) || !input || typeof input !== 'object' ||
      !id(input.tenantId) || !id(input.payrollRunId) || !id(input.employeeId) ||
      !VE_PAYROLL_CONTRIBUTION_FAMILIES.includes(input.family) ||
      (input.side !== 'EMPLOYEE' && input.side !== 'EMPLOYER') ||
      typeof input.selector !== 'string' || !/^[A-Z0-9_-]{1,64}$/.test(input.selector)) fail();

  // A rule for the employer can NEVER silently authorize an employee deduction,
  // or vice versa. Each side has a distinct, explicitly reviewed selector.
  const ruleSelector = `PAYROLL/${input.side}/${input.selector}`;
  const rule = resolveReviewedVeRule(rules, {
    tenantId: input.tenantId,
    family: input.family,
    selector: ruleSelector,
    eventDate: input.eventDate,
  });
  const applied = calculateReviewedVeTaxPreview(rule, {
    tenantId: input.tenantId,
    eventDate: input.eventDate,
    baseMinor: input.baseMinor,
  });
  const preview = {
    tenantId: input.tenantId,
    payrollRunId: input.payrollRunId,
    employeeId: input.employeeId,
    eventDate: input.eventDate,
    family: input.family,
    side: input.side,
    selector: input.selector,
    ruleSelector,
    baseMinor: applied.baseMinor,
    contributionMinor: applied.taxMinor,
    reviewedRuleSnapshotSha256: applied.snapshotSha256,
    sourceId: applied.sourceId,
    sourceContentSha256: applied.sourceContentSha256,
    reviewedBy: applied.reviewedBy,
    ruleVersion: applied.version,
    previewOnly: true as const,
  };
  const previewSha256 = createHash('sha256')
    .update('VE_PAYROLL_PREVIEW_V1\\n' + JSON.stringify(preview), 'utf8').digest('hex');
  return Object.freeze({ ...preview, previewSha256 });
}
