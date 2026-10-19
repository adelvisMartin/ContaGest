// @ts-check
/**
 * #743 Read-only closure evidence. Arithmetic equality never proves statement
 * reconciliation; every line must be present and reconciled in the same
 * currency. This does not post, reconcile or reverse any bank movement.
 * @param {{statementCurrency:unknown,accountCurrency:unknown,
 * hasClosingBalance:unknown,lineCount:unknown,unmatchedCount:unknown,
 * amountsEqual:unknown}} input
 */
export function evaluateBankClosingReadiness(input){
  /** @param {string} reason */
  const no=(reason)=>Object.freeze({reconciliationReady:false,readinessReason:reason});
  if(!input||typeof input!=='object'||Array.isArray(input))return no('INVALID_EVIDENCE');
  if(input.hasClosingBalance!==true)return no('CLOSING_BALANCE_MISSING');
  if(typeof input.statementCurrency!=='string'||typeof input.accountCurrency!=='string'
     || !/^[A-Z]{3}$/.test(input.statementCurrency)||input.statementCurrency!==input.accountCurrency)
    return no('CURRENCY_MISMATCH');
  if(!Number.isSafeInteger(input.lineCount)||!Number.isSafeInteger(input.unmatchedCount)
     ||input.lineCount<1||input.unmatchedCount<0||input.unmatchedCount>input.lineCount)
    return no('INVALID_COVERAGE');
  if(input.unmatchedCount!==0)return no('UNRECONCILED_LINES');
  if(input.amountsEqual!==true)return no('BALANCE_DIFFERENCE');
  return Object.freeze({reconciliationReady:true,readinessReason:'RECONCILED'});
}
