/** Server-side veterinary admission states (#816).
 * A same-state retry does not mutate timestamps or clinical notes.
 * Terminal statuses never reactivate a cage without a new admission.
 */
const TRANSITIONS=Object.freeze({
  admitted:Object.freeze(['observed','discharged','transferred','cancelled']),
  observed:Object.freeze(['discharged','transferred','cancelled']),
  discharged:Object.freeze([]),
  transferred:Object.freeze([]),
  cancelled:Object.freeze([])
});

export function veterinaryHospitalStatusTransitionAllowed(previous,next){
  return typeof previous==='string'&&typeof next==='string'
    &&Array.isArray(TRANSITIONS[previous])
    &&TRANSITIONS[previous].includes(next);
}

export function veterinaryHospitalCageLockKey(tenantId,ward,cage){
  if(typeof tenantId!=='string'||!tenantId||typeof ward!=='string'||
     typeof cage!=='string'||!ward.trim()||!cage.trim())
    throw new TypeError('VET_CAGE_LOCK_KEY_INVALID');
  return 'vet:hospital:cage:'+tenantId+':'+ward.trim().toLowerCase()+':'+cage.trim().toLowerCase();
}
