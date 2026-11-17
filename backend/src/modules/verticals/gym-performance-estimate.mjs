// Pure deterministic formula used by historical workout-performance projections.
// It is not a measured one-repetition maximum or a medical recommendation.
export function gymEpleyEstimate(loadKg,reps) {
  if(!Number.isFinite(loadKg)||loadKg<=0||
     !Number.isSafeInteger(reps)||reps<1||reps>12)return null;
  return Number((loadKg*(1+reps/30)).toFixed(2));
}
