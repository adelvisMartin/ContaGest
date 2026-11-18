// Pure deterministic formula used by historical workout-performance projections.
// It is not a measured one-repetition maximum or a medical recommendation.
export function gymEpleyEstimate(loadKg,reps) {
  if(!Number.isFinite(loadKg)||loadKg<=0||
     !Number.isSafeInteger(reps)||reps<1||reps>12)return null;
  const estimate=loadKg*(1+reps/30);
  if(!Number.isFinite(estimate))return null;
  return Number(estimate.toFixed(2));
}
