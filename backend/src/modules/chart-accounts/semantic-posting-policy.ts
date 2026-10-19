import type { SemanticAccountRole } from './account-role-policy.js';

/** Normal balance for posting templates; a line may debit/credit, but its account
 * must retain the tenant's expected normal nature. No national chart codes. */
export const SEMANTIC_POSTING_NATURE: Readonly<Record<SemanticAccountRole, 'debit' | 'credit'>> = Object.freeze({
  ar: 'debit', ap: 'credit', vat_output: 'credit', vat_input: 'debit',
  withholding_payable: 'credit', payroll_payable: 'credit', tax_payable: 'credit',
  cash: 'debit', bank: 'debit', revenue: 'credit', expense: 'debit',
  inventory: 'debit', asset: 'debit', cost_of_sales: 'debit',
});

export type SemanticPostingAccount = Readonly<{
  tenantId: string; role: SemanticAccountRole; accountCode: string;
  name: string; nature: string; active: boolean; allowPosting: boolean;
  parentCode: string | null;
}>;

const fail = (): never => { throw new Error('ACCOUNT_ROLE_POSTING_NOT_READY'); };

/** Fail closed on partial configuration, duplicates or tenant/account mismatch. */
export function assertSemanticPostingRoles(
  tenantId: string,
  requiredRoles: readonly SemanticAccountRole[],
  rows: readonly SemanticPostingAccount[],
): Readonly<Record<string, SemanticPostingAccount>> {
  if (typeof tenantId !== 'string' || tenantId.trim() !== tenantId || !tenantId ||
      !Array.isArray(requiredRoles) || requiredRoles.length === 0 ||
      new Set(requiredRoles).size !== requiredRoles.length ||
      requiredRoles.some(role => !Object.prototype.hasOwnProperty.call(SEMANTIC_POSTING_NATURE, role)) ||
      !Array.isArray(rows) || rows.length !== requiredRoles.length) fail();
  const required = new Set(requiredRoles);
  const byRole: Record<string, SemanticPostingAccount> = {};
  for (const row of rows) {
    if (!row || row.tenantId !== tenantId || !required.has(row.role) || byRole[row.role] ||
        typeof row.accountCode !== 'string' || !row.accountCode.trim() ||
        typeof row.name !== 'string' || !row.name.trim() ||
        row.nature !== SEMANTIC_POSTING_NATURE[row.role] ||
        row.active !== true || row.allowPosting !== true ||
        (row.parentCode !== null && typeof row.parentCode !== 'string')) fail();
    byRole[row.role] = Object.freeze({ ...row });
  }
  if (requiredRoles.some(role => !byRole[role])) fail();
  return Object.freeze(byRole);
}
