// @ts-check
/**
 * Keep meal planning time a local 24-hour clock, without a timezone or date.
 * Accept blank as the existing UI's "no scheduled hour" value.
 * @param {unknown} value
 */
export function validGymMealClockTime(value) {
  return typeof value==='string' &&
    (value==='' || /^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/.test(value));
}
