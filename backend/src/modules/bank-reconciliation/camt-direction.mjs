/** #743 Validate CAMT credit/debit markers before applying financial signs. */
export function normalizeCamtDirection(value) {
  if(typeof value !== 'string') throw new TypeError('BANK_STATEMENT_DIRECTION_INVALID');
  const indicator = value.trim().toUpperCase();
  if(indicator !== 'CRDT' && indicator !== 'DBIT')
    throw new TypeError('BANK_STATEMENT_DIRECTION_INVALID');
  return indicator;
}

/** Canonical amount is in cents from the domain decimal parser, never JS Number. */
export function signedCamtAmount(amount, direction) {
  const indicator = normalizeCamtDirection(direction);
  if(typeof amount !== 'string' || !/^-?\d+\.\d{2}$/.test(amount))
    throw new TypeError('BANK_STATEMENT_CAMT_AMOUNT_INVALID');
  if(indicator === 'CRDT') {
    if(amount.startsWith('-')) throw new TypeError('BANK_STATEMENT_CAMT_AMOUNT_INVALID');
    return amount;
  }
  // Preserve negative DBIT from legacy files; never invert a debit twice.
  return amount.startsWith('-') || amount === '0.00' ? amount : '-' + amount;
}
