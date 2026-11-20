/** #710: distinguish an unmeasured periodontal site from a clinical zero.
 * HTML number inputs submit empty strings, while Boolean/null coercion to 0
 * would silently record normal findings on a signed clinical chart.
 * Keep finite numeric values and decimal integer strings compatible.
 */
export function normalizePeriodontalInteger(value:unknown):number {
  if(typeof value==='number')return Number.isFinite(value)?value:Number.NaN;
  if(typeof value!=='string')return Number.NaN;
  const text=value.trim();
  if(!/^-?\d+(?:\.0+)?$/.test(text))return Number.NaN;
  return Number(text);
}
