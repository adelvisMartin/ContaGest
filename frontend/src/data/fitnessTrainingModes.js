export const FITNESS_TRAINING_MODES=Object.freeze([
  {value:'strength',label:'Fuerza',description:'Prioriza producción de fuerza con técnica estable y descansos amplios.',focus:'Fuerza máxima/submáxima',typicalReps:'1–6',typicalRest:'120–300 s'},
  {value:'hypertrophy',label:'Hipertrofia',description:'Prioriza volumen efectivo y tensión mecánica con esfuerzo controlado.',focus:'Ganancia muscular',typicalReps:'6–15',typicalRest:'60–180 s'},
  {value:'pump',label:'Bombeo / metabólico',description:'Prioriza densidad, congestión y estrés metabólico sin convertirlo en regla universal.',focus:'Estrés metabólico',typicalReps:'12–30',typicalRest:'20–75 s'},
  {value:'endurance',label:'Resistencia muscular',description:'Prioriza sostener trabajo repetido con cargas moderadas y descansos contenidos.',focus:'Resistencia local',typicalReps:'15–40+',typicalRest:'20–90 s'},
  {value:'power',label:'Potencia',description:'Prioriza velocidad e intención explosiva con calidad alta en cada repetición.',focus:'Fuerza × velocidad',typicalReps:'1–6',typicalRest:'120–300 s'},
  {value:'conditioning',label:'Acondicionamiento',description:'Prioriza capacidad de trabajo mediante bloques, circuitos o intervalos.',focus:'Capacidad de trabajo',typicalReps:'Por tiempo/rondas',typicalRest:'Variable'},
  {value:'mobility',label:'Movilidad',description:'Prioriza control activo, rango útil y calidad del movimiento.',focus:'Rango y control',typicalReps:'5–15 / tiempo',typicalRest:'Según calidad'}
]);

export const fitnessTrainingMode=(value)=>FITNESS_TRAINING_MODES.find((mode)=>mode.value===value)||null;
export const fitnessTrainingModeLabel=(value)=>fitnessTrainingMode(value)?.label||(value==='unspecified'?'Sin clasificar (legacy)':'Sin modo');
