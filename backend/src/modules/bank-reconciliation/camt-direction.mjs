/** #743 Validate CAMT credit/debit markers before applying financial signs. */
export function normalizeCamtDirection(value) {
  if(typeof value !== 'string') throw new TypeError('BANK_STATEMENT_DIRECTION_INVALID');
  const indicator = value.trim().toUpperCase();
  if(indicator !== 'CRDT' && indicator !== 'DBIT')
    throw new TypeError('BANK_STATEMENT_DIRECTION_INVALID');
  return indicator;
}
