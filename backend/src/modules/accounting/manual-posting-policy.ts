/**
 * #637: Manual journal posting requires persisted, active, postable chart accounts
 * owned by the same authenticated tenant. Ledger Decimal balance is checked
 * separately by the accounting domain service.
 */
export type PostingAccountSnapshot = Readonly<{
  tenantId: string; code: string; active: boolean; allowPosting: boolean;
}>;
export type PostingLedgerLine = Readonly<{ accountCode: string }>;
const denied = (): never => { throw new Error('MANUAL_POSTING_ACCOUNT_NOT_AUTHORIZED'); };
export function assertManualPostingAccounts(
  tenantId: string, lines: readonly PostingLedgerLine[],
  accounts: readonly PostingAccountSnapshot[],
): void {
  if (typeof tenantId !== 'string' || !tenantId.trim() ||
      !Array.isArray(lines) || lines.length < 2 || lines.length > 200 ||
      !Array.isArray(accounts) || accounts.some(a => !a || a.tenantId !== tenantId)) denied();
  const byCode = new Map<string, PostingAccountSnapshot>();
  for (const account of accounts) {
    if (typeof account.code !== 'string' || !account.code.trim() || byCode.has(account.code)) denied();
    byCode.set(account.code, account);
  }
  for (const line of lines) {
    if (!line || typeof line.accountCode !== 'string' || !line.accountCode.trim()) denied();
    const account = byCode.get(line.accountCode);
    if (!account || account.active !== true || account.allowPosting !== true) denied();
  }
}
