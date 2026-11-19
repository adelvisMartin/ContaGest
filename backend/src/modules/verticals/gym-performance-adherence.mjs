// Prescriptions are snapshotted when a workout session starts (#789).
// A legacy/invalid snapshot cannot be reconstructed from today's routine.
export function gymHistoricalPlanCoverage(sessions) {
  // A missing/corrupt history must not create a falsely complete plan.
  if (!Array.isArray(sessions)) return {plannedSets:0,unknownPlanSessions:1,planComplete:false};
  let plannedSets = 0;
  let unknownPlanSessions = 0;
  for (const session of sessions) {
    const prescription = session?.routineSnapshot;
    if (!Array.isArray(prescription) || prescription.length === 0) {
      unknownPlanSessions += 1;
      continue;
    }
    let sessionSets = 0;
    let valid = true;
    for (const exercise of prescription) {
      if (!exercise || !Number.isSafeInteger(exercise.sets) || exercise.sets < 0 ||
          !Number.isSafeInteger(sessionSets + exercise.sets)) {
        valid = false;
        break;
      }
      sessionSets += exercise.sets;
    }
    if (!valid || !Number.isSafeInteger(plannedSets + sessionSets)) {
      unknownPlanSessions += 1;
      continue;
    }
    plannedSets += sessionSets;
  }
  return {
    plannedSets,
    unknownPlanSessions,
    planComplete: unknownPlanSessions === 0
  };
}

export function gymHistoricalSetAdherence(completedSets, coverage) {
  if (coverage?.planComplete !== true ||
      !Number.isSafeInteger(coverage.plannedSets) || coverage.plannedSets <= 0 ||
      !Number.isSafeInteger(completedSets) || completedSets < 0) return null;
  return Number((Math.min(1, completedSets / coverage.plannedSets) * 100).toFixed(1));
}
