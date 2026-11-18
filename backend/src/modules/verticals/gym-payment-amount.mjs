// @ts-check
/**
 * #746: exact cents for Gym payment transport. PostgreSQL numeric is the
 * monetary authority; JavaScript floating point must never round or infer
 * a number of cents on behalf of the payer.
 *
 * @param {unknown} value
 * @returns {string} Canonical non-zero, positive decimal (2 fractional digits)
 */
export function normalizeGymPaymentAmount(value){
  if(typeof value!=='string' && (typeof value!=='number'||!Number.isFinite(value)))
    throw new TypeError('GYM_PAYMENT_AMOUNT_INVALID');
  // Existing JSON clients send numeric literals; preserve those when their
  // round-trip decimal form is exactly representable in cents.
  const literal=typeof value==='string'?value.trim():String(value);
  if(!/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/.test(literal))
    throw new TypeError('GYM_PAYMENT_AMOUNT_INVALID');
  const [whole,fraction='']=literal.split('.');
  const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')||'0');
  if(cents<1n || cents>99999999900n)
    throw new TypeError('GYM_PAYMENT_AMOUNT_INVALID');
  return whole+'.'+fraction.padEnd(2,'0');
}
