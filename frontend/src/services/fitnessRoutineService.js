import { FITNESS_EXERCISES, FITNESS_MUSCLES } from '../data/fitnessExerciseCatalog.js';

const norm=(value)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));
const levelName=(value)=>norm(value).includes('avan')?'Avanzado':norm(value).includes('inter')?'Intermedio':'Principiante';
const goalName=(value)=>norm(value).includes('fuer')?'Fuerza':norm(value).includes('resist')?'Resistencia muscular':norm(value).includes('poten')||norm(value).includes('acond')?'Potencia / acondicionamiento':'Hipertrofia / volumen';

function dose(goal,compound,level,index=0){
  const beginner=level==='Principiante';
  if(goal==='Fuerza')return compound?{sets:beginner?2:3,reps:'4–6',restSeconds:180,rir:2}:{sets:2,reps:'6–10',restSeconds:120,rir:2};
  if(goal==='Resistencia muscular')return{sets:beginner?2:3,reps:'12–20',restSeconds:60,rir:2};
  if(goal==='Potencia / acondicionamiento')return compound?{sets:3,reps:'3–6',restSeconds:150,rir:3}:{sets:2,reps:'8–12',restSeconds:90,rir:2};
  return compound?{sets:beginner?2:3,reps:'6–10',restSeconds:120,rir:2}:{sets:beginner?2:3,reps:index%2?'8–12':'10–15',restSeconds:75,rir:2};
}
function context(muscles,goal){
  const upper=muscles.some((m)=>['Pecho','Espalda','Hombros','Bíceps','Tríceps','Trapecio','Antebrazo'].includes(m));
  const lower=muscles.some((m)=>['Cuádriceps','Femoral / isquios','Glúteos','Aductores','Abductores','Gemelos'].includes(m));
  const structure=muscles.includes('Pecho')&&muscles.includes('Espalda')?'Empuje + tracción antagonista; alterna patrones sin sacrificar técnica.'
    :muscles.includes('Bíceps')&&muscles.includes('Tríceps')?'Brazos antagonistas; combina flexión/extensión de codo y controla volumen total.'
    :muscles.includes('Cuádriceps')&&muscles.includes('Femoral / isquios')?'Dominante de rodilla + cadena posterior; distribuye la fatiga.'
    :muscles.length===1?`Sesión especializada de ${muscles[0]} con patrones distintos.`:'Compuestos primero y accesorios después; reparte volumen según duración.';
  const impact=goal==='Fuerza'?'Prioriza producción de fuerza y técnica con descansos largos.'
    :goal==='Resistencia muscular'?'Prioriza tolerancia al volumen y repeticiones sostenidas con descansos moderados.'
    :goal==='Potencia / acondicionamiento'?'Prioriza velocidad y calidad técnica; detén la serie si cae claramente la ejecución.'
    :'Prioriza tensión mecánica y volumen útil manteniendo aproximadamente 1–3 repeticiones en reserva.';
  return{structure,impact,warmup:`7–12 min: actividad ligera${upper?'; movilidad/control escapular + aproximaciones':''}${lower?'; movilidad de tobillo/cadera + sentadilla o bisagra sin carga':''}.`};
}

export const FitnessRoutineService={
  muscles:FITNESS_MUSCLES,
  generate(input={}){
    const muscles=[...new Set((input.muscles||[]).filter((m)=>FITNESS_MUSCLES.includes(m)))];if(!muscles.length)muscles.push('Pecho','Tríceps');
    const level=levelName(input.level),goal=goalName(input.goal),durationMin=clamp(input.durationMin||60,25,120),rotation=Math.abs(Number(input.rotationIndex||new Date().getDate()))||1;
    let count=muscles.length<=1?4:muscles.length===2?3:2;if(durationMin<=40)count=Math.max(1,count-1);if(durationMin>=80&&muscles.length<=3)count=Math.min(5,count+1);if(level==='Principiante')count=Math.min(3,count);
    const exercises=[];let totalSets=0;
    muscles.forEach((muscle,muscleIndex)=>{const pool=FITNESS_EXERCISES[muscle]||[];for(let index=0;index<Math.min(count,pool.length);index+=1){const item=pool[(rotation+muscleIndex*2+index)%pool.length];const prescription=dose(goal,item.compound,level,index);totalSets+=prescription.sets;exercises.push({...item,muscle,...prescription,dayOfWeek:1,sortOrder:exercises.length+1});}});
    return{name:`${muscles.join(' + ')} · ${goal}`,muscles,level,goal,durationMin,totalSets,...context(muscles,goal),exercises,notes:String(input.notes||'').trim()};
  },
  toApiExercises(routine){return routine.exercises.map((item)=>({dayOfWeek:1,sortOrder:item.sortOrder,exerciseName:item.name,muscleGroup:item.muscle,equipment:item.equipment,instructions:item.cue,sets:item.sets,reps:item.reps,restSeconds:item.restSeconds,tempo:'controlado',notes:`RIR ${item.rir}`}));},
  whatsapp(routine,{clientName='',guest=true}={}){
    const lines=[`🏋️ RUTINA DE HOY · ${routine.muscles.join(' + ')}`,`${routine.goal} · ${routine.level} · ~${routine.durationMin} min`,'',`Calentamiento: ${routine.warmup}`,''];let group='';
    routine.exercises.forEach((item)=>{if(item.muscle!==group){group=item.muscle;lines.push(group.toUpperCase());}lines.push(`• ${item.name}: ${item.sets} × ${item.reps} · RIR ${item.rir} · descanso ${item.restSeconds}s`,`  Técnica: ${item.cue}`);});
    lines.push('',`Impacto esperado: ${routine.impact}`,`Estructura: ${routine.structure}`,'Progresión: completa el extremo alto con técnica estable y 1–3 RIR antes de subir carga de forma conservadora.');if(routine.notes)lines.push(`Nota del entrenador: ${routine.notes}`);if(!guest&&clientName)lines.unshift(`Para: ${clientName}`);return lines.join('\n');
  }
};
