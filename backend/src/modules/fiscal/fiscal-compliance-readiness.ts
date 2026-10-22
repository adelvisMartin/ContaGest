import { createHash } from 'node:crypto';

// #783: deterministic reconciliation readiness over EXISTING tenant data.
// Internal TaxDeclaration statuses cannot prove external filing.
export type ComplianceDeclaration = Readonly<{ id: string; kind: string; status: string; amountExact: string }>;
export type ComplianceClosing = Readonly<{ module: string; status: string }>;
export type CompliancePeriodInput = Readonly<{
  tenantId: string; period: string;
  taxPeriod: Readonly<{ id: string; status: string; recordedBalancesExact?: Readonly<{
    ivaDebit: string; ivaCredit: string; igtfPaid: string;
  }> }> | null;
  declarations: readonly ComplianceDeclaration[];
  closings: readonly ComplianceClosing[];
  fiscalDocumentCount: number;
}>;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const AMOUNT = /^-?\d{1,20}(?:\.\d{1,4})?$/;
const KINDS = new Set(['iva', 'islr', 'igtf', 'retiva', 'municipal', 'other']);
const MODULES = new Set(['fiscal', 'iva', 'islr', 'igtf', 'retiva', 'municipal']);
function failed(): never { throw new Error('COMPLIANCE_PERIOD_EVIDENCE_INVALID'); }
function id(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 160;
}
function byteOrder(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }

export function buildCompliancePeriodReadiness(input: CompliancePeriodInput) {
  if (!input || !id(input.tenantId) || !PERIOD.test(input.period) ||
      !Array.isArray(input.declarations) || input.declarations.length > 200 ||
      !Array.isArray(input.closings) || input.closings.length > 20 ||
      !Number.isSafeInteger(input.fiscalDocumentCount) || input.fiscalDocumentCount < 0 ||
      (input.taxPeriod !== null && (!input.taxPeriod || !id(input.taxPeriod.id) ||
        !id(input.taxPeriod.status)))) failed();
  if (input.taxPeriod === null && input.declarations.length) failed();
  const balances = input.taxPeriod?.recordedBalancesExact;
  if (balances !== undefined && (
      !balances || typeof balances !== 'object' || Array.isArray(balances) ||
      Object.keys(balances).length !== 3 ||
      ![balances.ivaDebit, balances.ivaCredit, balances.igtfPaid].every(value =>
        typeof value === 'string' && AMOUNT.test(value))
  )) failed();
  const seen = new Set<string>();
  const declarations = input.declarations.map((row) => {
    if (!row || !id(row.id) || seen.has(row.id) || !KINDS.has(row.kind) ||
        !id(row.status) || !AMOUNT.test(row.amountExact)) failed();
    seen.add(row.id);
    return Object.freeze({
      id: row.id, kind: row.kind, internalStatus: row.status, amountExact: row.amountExact,
      externalFiling: 'NOT_VERIFIED' as const,
      bankReconciliation: 'NOT_VERIFIED' as const,
    });
  }).sort((a, b) => byteOrder(a.id, b.id));
  const modules = new Set<string>();
  const closings = input.closings.map((row) => {
    if (!row || !MODULES.has(row.module) || modules.has(row.module) || !id(row.status)) failed();
    modules.add(row.module);
    return Object.freeze({ module: row.module, internalStatus: row.status });
  }).sort((a, b) => byteOrder(a.module, b.module));
  const blockers = [
    'LEGAL_RULE_PROVENANCE_NOT_LINKED',
    'EXTERNAL_FILING_UNVERIFIED',
    'PAYMENT_LEDGER_RECONCILIATION_UNVERIFIED',
    ...(input.taxPeriod ? [] : ['TAX_PERIOD_NOT_REGISTERED']),
    ...(declarations.length ? [] : ['NO_DECLARATIONS_TO_REVIEW']),
  ];
  const evidence = {
    tenantId: input.tenantId, period: input.period,
    taxPeriod: input.taxPeriod ? { id: input.taxPeriod.id, internalStatus: input.taxPeriod.status,
      recordedBalancesExact: balances ? Object.freeze({ ...balances }) : null } : null,
    fiscalDocumentCount: input.fiscalDocumentCount, declarations, closings,
  };
  const evidenceSha256 = createHash('sha256').update(JSON.stringify(evidence), 'utf8').digest('hex');
  return Object.freeze({
    ...evidence, declarations: Object.freeze(declarations), closings: Object.freeze(closings),
    blockers: Object.freeze(blockers), evidenceSha256,
    status: 'BLOCKED_NOT_READY' as const, officialFilingIntegration: false, safeToFileOrPay: false,
  });
}
