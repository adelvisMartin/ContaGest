export const FITNESS_INTENSITY_TECHNIQUES=Object.freeze([
  {value:'standard',label:'Técnica estándar',description:'Series convencionales sin técnica de intensidad adicional.',config:[]},
  {value:'drop_set',label:'Drop set',description:'Reduce la carga tras alcanzar el objetivo de la serie y continúa en rondas planificadas.',config:['rounds','loadDropPct']},
  {value:'rest_pause',label:'Rest-pause',description:'Divide el esfuerzo en bloques cortos separados por descansos intra-técnica.',config:['rounds','intraRestSeconds']},
  {value:'myo_reps',label:'Myo-reps',description:'Serie de activación seguida por mini-series con descansos breves planificados.',config:['rounds','intraRestSeconds']},
  {value:'cluster',label:'Cluster sets',description:'Fracciona la serie en bloques de repeticiones con pausas cortas planificadas.',config:['rounds','intraRestSeconds']},
  {value:'superset',label:'Superset',description:'Agrupa dos ejercicios consecutivos bajo una misma clave explícita.',config:['groupKey']},
  {value:'giant_set',label:'Giant set',description:'Agrupa tres o más ejercicios bajo una misma clave explícita.',config:['groupKey']},
  {value:'mechanical_drop',label:'Mechanical drop set',description:'Continúa el esfuerzo cambiando palanca o variante sin requerir reducción de carga.',config:['rounds']},
  {value:'isometric_hold',label:'Pausa isométrica',description:'Añade una retención isométrica de duración explícita.',config:['holdSeconds']}
]);

export const fitnessIntensityTechnique=(value)=>FITNESS_INTENSITY_TECHNIQUES.find((item)=>item.value===value)||FITNESS_INTENSITY_TECHNIQUES[0];
export const fitnessIntensityTechniqueLabel=(value)=>fitnessIntensityTechnique(value).label;
