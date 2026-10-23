// #785: binding between tenant-owned chart account and a semantic role.
// Posting is NOT enabled by a binding; the ledger remains its sole authority.
export const SEMANTIC_ACCOUNT_ROLES = Object.freeze([
  'ar', 'ap', 'vat_output', 'vat_input', 'withholding_payable', 'withholding_receivable',
  'payroll_payable', 'tax_payable', 'cash', 'bank', 'revenue',
  'expense', 'inventory', 'asset', 'cost_of_sales',
] as const);
export type SemanticAccountRole = typeof SEMANTIC_ACCOUNT_ROLES[number];
export type PostingAccount = Readonly<{
  tenantId: string; code: string; active: boolean; allowPosting: boolean;
  nature: string; parentCode: string | null;
}>;
const fail = (): never => { throw new Error('ACCOUNT_ROLE_MAPPING_NOT_POSTABLE'); };
export function assertSemanticAccountBinding(
  account: PostingAccount | null,
  request: Readonly<{ tenantId: string; role: SemanticAccountRole; expectedNature?: 'debit' | 'credit' }>,
) {
  if (!request || typeof request.tenantId !== 'string' || !request.tenantId ||
      !SEMANTIC_ACCOUNT_ROLES.includes(request.role) ||
      (request.expectedNature !== undefined && !['debit', 'credit'].includes(request.expectedNature)) ||
      !account || account.tenantId !== request.tenantId ||
      typeof account.code !== 'string' || !account.code ||
      account.active !== true || account.allowPosting !== true ||
      !['debit', 'credit'].includes(account.nature) ||
      (request.expectedNature && account.nature !== request.expectedNature) ||
      (account.parentCode !== null && typeof account.parentCode !== 'string')) fail();
  if (!account) throw new Error('ACCOUNT_ROLE_MAPPING_NOT_POSTABLE');
  return Object.freeze({ tenantId: request.tenantId, role: request.role, accountCode: account.code, nature: account.nature });
}
