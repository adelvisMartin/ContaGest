/** #789: version boundaries for the canonical GymPeriodizationProgram table. */
export function nextPeriodizationVersion(sourceVersion: unknown, currentMax: unknown): number {
  if(typeof sourceVersion!=='number'||typeof currentMax!=='number'||
     !Number.isSafeInteger(sourceVersion)||!Number.isSafeInteger(currentMax)||
     sourceVersion<1||currentMax<1||currentMax>=2147483647){
    throw new TypeError('GYM_PERIODIZATION_VERSION_INVALID');
  }
  if(sourceVersion!==currentMax)throw new TypeError('GYM_PERIODIZATION_STALE_VERSION');
  return currentMax+1;
}
