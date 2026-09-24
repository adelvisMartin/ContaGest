export type GymProgressionStrategy = 'manual' | 'linear_load' | 'double_progression' | 'percent_1rm';

export type GymProgressionConfig = {
  repRangeMin?: number | null;
  repRangeMax?: number | null;
  repIncrement?: number | null;
  loadIncrementKg?: number | null;
  targetRir?: number | null;
  targetRpe?: number | null;
  oneRepMaxKg?: number | null;
  percent1Rm?: number | null;
  stallAfter?: number | null;
  resetPct?: number | null;
};

export type GymProgressionEvaluationInput = {
  strategy: GymProgressionStrategy;
  config: GymProgressionConfig;
  current: {
    loadKg?: number | null;
    reps: number;
  };
  performance: {
    completed: boolean;
    achievedReps: number;
    rir?: number | null;
    rpe?: number | null;
    consecutiveMisses: number;
  };
};

export type GymProgressionConfigIssue = {
  field: keyof GymProgressionConfig;
  message: string;
};

export const isRirRpePairCoherent = (rir?: number | null, rpe?: number | null) =>
  rir == null || rpe == null || Math.abs((10 - Number(rir)) - Number(rpe)) <= 0.5;

export function gymProgressionConfigIssues(
  strategy: GymProgressionStrategy,
  config: GymProgressionConfig = {}
): GymProgressionConfigIssue[] {
  const issues: GymProgressionConfigIssue[] = [];

  if (!isRirRpePairCoherent(config.targetRir, config.targetRpe)) {
    issues.push({ field:'targetRpe', message:'RPE y RIR no son coherentes entre sí.' });
  }

  if (strategy === 'linear_load' && !config.loadIncrementKg) {
    issues.push({ field:'loadIncrementKg', message:'La progresión lineal requiere un incremento de carga.' });
  }

  if (strategy === 'double_progression') {
    if (!config.repRangeMin || !config.repRangeMax || Number(config.repRangeMin) > Number(config.repRangeMax)) {
      issues.push({ field:'repRangeMax', message:'La doble progresión requiere un rango de repeticiones válido.' });
    }
    if (!config.loadIncrementKg) {
      issues.push({ field:'loadIncrementKg', message:'La doble progresión requiere un incremento de carga.' });
    }
  }

  if (strategy === 'percent_1rm' && (!config.oneRepMaxKg || !config.percent1Rm)) {
    issues.push({ field:'percent1Rm', message:'La progresión por %1RM requiere 1RM y porcentaje.' });
  }

  return issues;
}

const roundToIncrement = (value:number, increment:number) => {
  const safeIncrement=Number.isFinite(increment)&&increment>0?increment:0.25;
  return Number((Math.round(value/safeIncrement)*safeIncrement).toFixed(3));
};

const effortEvidence = (input:GymProgressionEvaluationInput) => {
  const {config,performance}=input;
  const requiresRir=config.targetRir!=null;
  const requiresRpe=config.targetRpe!=null;
  if(requiresRir&&performance.rir==null)return {satisfied:false,complete:false};
  if(requiresRpe&&performance.rpe==null)return {satisfied:false,complete:false};
  const rirOk=!requiresRir||Number(performance.rir)>=Number(config.targetRir);
  const rpeOk=!requiresRpe||Number(performance.rpe)<=Number(config.targetRpe);
  return {satisfied:rirOk&&rpeOk,complete:true};
};

export const evaluateGymProgression = (input:GymProgressionEvaluationInput) => {
  const strategy=input.strategy;
  const config=input.config||{};
  const currentLoad=Math.max(0,Number(input.current.loadKg||0));
  const currentReps=Math.max(1,Math.round(Number(input.current.reps||1)));
  const achievedReps=Math.max(0,Math.round(Number(input.performance.achievedReps||0)));
  const increment=Math.max(0.01,Number(config.loadIncrementKg||0.25));
  const stallAfter=Math.max(1,Math.round(Number(config.stallAfter||3)));
  const resetPct=Math.min(50,Math.max(1,Number(config.resetPct||10)));
  const effort=effortEvidence(input);
  const base={
    engineVersion:'gym-progression-38-v1',
    strategy,
    config:{...config},
    evidence:{...input.performance},
    action:'hold' as 'hold'|'increase_load'|'increase_reps'|'target_percent_1rm'|'reset_load',
    current:{loadKg:currentLoad,reps:currentReps},
    next:{loadKg:currentLoad,reps:currentReps},
    reasons:[] as string[],
    applied:false
  };

  if(strategy==='manual'){
    base.reasons.push('manual_strategy');
    return base;
  }

  if(input.performance.consecutiveMisses>=stallAfter){
    base.action='reset_load';
    base.next.loadKg=roundToIncrement(currentLoad*(1-resetPct/100),increment);
    base.next.reps=Math.max(1,Math.round(Number(config.repRangeMin||currentReps)));
    base.reasons.push('stall_threshold_reached');
    return base;
  }

  if(strategy==='percent_1rm'){
    const oneRepMax=Number(config.oneRepMaxKg||0);
    const percent=Number(config.percent1Rm||0);
    base.action='target_percent_1rm';
    base.next.loadKg=roundToIncrement(oneRepMax*(percent/100),increment);
    base.reasons.push('percent_1rm_target');
    return base;
  }

  if((config.targetRir!=null||config.targetRpe!=null)&&!effort.complete){
    base.reasons.push('missing_effort_evidence');
    return base;
  }
  if(!input.performance.completed){
    base.reasons.push('prescription_not_completed');
    return base;
  }
  if(!effort.satisfied){
    base.reasons.push('effort_target_not_met');
    return base;
  }

  if(strategy==='linear_load'){
    if(achievedReps<currentReps){
      base.reasons.push('repetition_target_not_met');
      return base;
    }
    base.action='increase_load';
    base.next.loadKg=roundToIncrement(currentLoad+increment,increment);
    base.reasons.push('linear_load_target_met');
    return base;
  }

  const minReps=Math.max(1,Math.round(Number(config.repRangeMin||currentReps)));
  const maxReps=Math.max(minReps,Math.round(Number(config.repRangeMax||minReps)));
  const repIncrement=Math.max(1,Math.round(Number(config.repIncrement||1)));
  const boundedCurrent=Math.min(maxReps,Math.max(minReps,currentReps));

  if(achievedReps>=maxReps){
    base.action='increase_load';
    base.next.loadKg=roundToIncrement(currentLoad+increment,increment);
    base.next.reps=minReps;
    base.reasons.push('double_progression_top_of_range');
    return base;
  }
  if(achievedReps>=boundedCurrent){
    base.action='increase_reps';
    base.next.reps=Math.min(maxReps,boundedCurrent+repIncrement);
    base.reasons.push('double_progression_rep_target_met');
    return base;
  }

  base.reasons.push('double_progression_target_not_met');
  return base;
};
