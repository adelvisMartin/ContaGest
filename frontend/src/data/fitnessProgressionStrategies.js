export const FITNESS_PROGRESSION_STRATEGIES=Object.freeze([
  {
    value:'manual',
    label:'Manual',
    description:'No calcula cambios. El profesional ajusta carga y repeticiones de forma explícita.',
    config:[]
  },
  {
    value:'linear_load',
    label:'Progresión lineal de carga',
    description:'Aumenta la carga cuando se cumplen repeticiones y objetivo de esfuerzo.',
    config:['loadIncrementKg','targetRir','targetRpe','stallAfter','resetPct']
  },
  {
    value:'double_progression',
    label:'Doble progresión',
    description:'Primero aumenta repeticiones dentro de un rango; al alcanzar el techo incrementa carga y vuelve al mínimo.',
    config:['repRangeMin','repRangeMax','repIncrement','loadIncrementKg','targetRir','targetRpe','stallAfter','resetPct']
  },
  {
    value:'percent_1rm',
    label:'Objetivo por %1RM',
    description:'Calcula la carga objetivo desde un 1RM de referencia y un porcentaje explícito.',
    config:['oneRepMaxKg','percent1Rm','loadIncrementKg','stallAfter','resetPct']
  }
]);

export const fitnessProgressionStrategy=(value)=>FITNESS_PROGRESSION_STRATEGIES.find((item)=>item.value===value)||FITNESS_PROGRESSION_STRATEGIES[0];
export const fitnessProgressionStrategyLabel=(value)=>fitnessProgressionStrategy(value).label;
