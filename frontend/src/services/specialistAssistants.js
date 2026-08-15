const ROUTINE_LIBRARY = {
  pecho: [
    ['Press de banca', 'Pecho · tríceps', 'Controla la bajada y mantén escápulas estables.'],
    ['Press inclinado con mancuernas', 'Pecho superior', 'Recorrido cómodo y sin rebotar.'],
    ['Aperturas en polea o máquina', 'Pecho', 'Mantén tensión continua; no fuerces el hombro.'],
    ['Flexiones', 'Pecho · tríceps · core', 'Cuerpo alineado y rango que puedas controlar.']
  ],
  hombros: [
    ['Press militar con mancuernas', 'Deltoides', 'Costillas controladas y trayectoria estable.'],
    ['Elevaciones laterales', 'Deltoides lateral', 'Sube sin balanceo y evita encoger hombros.'],
    ['Pájaros / reverse fly', 'Deltoides posterior', 'Prioriza control escapular.'],
    ['Face pull', 'Deltoides posterior · espalda alta', 'Tira hacia la cara sin arquear la zona lumbar.']
  ],
  triceps: [
    ['Extensión de tríceps en polea', 'Tríceps', 'Codos estables junto al cuerpo.'],
    ['Extensión por encima de la cabeza', 'Tríceps largo', 'No fuerces el hombro; controla el rango.'],
    ['Press cerrado', 'Tríceps · pecho', 'Agarre cómodo y descenso controlado.']
  ],
  espalda: [
    ['Jalón al pecho', 'Dorsal', 'Inicia con depresión escapular y evita tirar con impulso.'],
    ['Remo sentado', 'Espalda media', 'Pecho estable; lleva codos atrás.'],
    ['Remo con mancuerna', 'Dorsal · espalda media', 'Evita rotar el tronco.'],
    ['Pullover en polea', 'Dorsal', 'Brazos casi extendidos y costillas controladas.']
  ],
  biceps: [
    ['Curl con barra o mancuernas', 'Bíceps', 'Sin balanceo del tronco.'],
    ['Curl martillo', 'Braquial · antebrazo', 'Muñeca neutra y codo estable.'],
    ['Curl inclinado', 'Bíceps', 'Usa rango cómodo y descenso lento.']
  ],
  piernas: [
    ['Sentadilla o prensa', 'Cuádriceps · glúteos', 'Rodillas alineadas con los pies.'],
    ['Extensión de cuádriceps', 'Cuádriceps', 'Sube controlado y evita bloquear con golpe.'],
    ['Curl femoral', 'Isquiotibiales', 'Cadera estable y recorrido controlado.'],
    ['Peso muerto rumano', 'Isquiotibiales · glúteos', 'Bisagra de cadera y espalda neutra.']
  ],
  gluteos: [
    ['Hip thrust', 'Glúteos', 'Pausa arriba sin hiperextender la zona lumbar.'],
    ['Abducción de cadera', 'Glúteo medio', 'Evita balanceo y controla el retorno.'],
    ['Zancadas', 'Glúteos · cuádriceps', 'Paso estable y rodilla alineada.']
  ],
  core: [
    ['Plancha', 'Core', 'Mantén pelvis y caja torácica alineadas.'],
    ['Pallof press', 'Core anti-rotación', 'Resiste la rotación y respira con control.'],
    ['Dead bug', 'Core', 'Evita despegar la zona lumbar.']
  ]
};

const LEVELS = {
  basico: { sets:[2,3], reps:'10–15', rest:'75–90 s', intensity:'RPE 6–7', maxExercises:5 },
  intermedio: { sets:[3,4], reps:'8–12', rest:'75–120 s', intensity:'RPE 7–8', maxExercises:7 },
  avanzado: { sets:[3,5], reps:'6–12', rest:'90–150 s', intensity:'RPE 7–9', maxExercises:8 }
};

function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function unique(list) { return [...new Set((list || []).filter(Boolean))]; }
function normalizeMuscles(input) { return unique((Array.isArray(input) ? input : String(input || '').split(',')).map((x)=>String(x).trim().toLowerCase())).filter((x)=>ROUTINE_LIBRARY[x]); }

export function generateQuickRoutine(input = {}) {
  const levelKey = ['basico','intermedio','avanzado'].includes(input.level) ? input.level : 'basico';
  const cfg = LEVELS[levelKey];
  const muscles = normalizeMuscles(input.muscles).length ? normalizeMuscles(input.muscles) : ['pecho'];
  const duration = clamp(input.duration || 50, 20, 120);
  const maxByTime = Math.max(3, Math.min(cfg.maxExercises, Math.floor(duration / 8)));
  const pool = muscles.flatMap((muscle)=>ROUTINE_LIBRARY[muscle].map((exercise)=>({ muscle, exercise })));
  const picked = [];
  for (const item of pool) {
    if (picked.some((row)=>row.exercise[0] === item.exercise[0])) continue;
    picked.push(item);
    if (picked.length >= maxByTime) break;
  }
  const goal = input.goal || 'hipertrofia';
  const repOverride = goal === 'fuerza' ? (levelKey === 'basico' ? '6–10' : '4–8') : goal === 'resistencia' ? '12–20' : cfg.reps;
  const exercises = picked.map((item, index)=>({
    order:index + 1,
    name:item.exercise[0],
    target:item.exercise[1],
    sets:cfg.sets[0] + (index < 2 && levelKey !== 'basico' ? 1 : 0),
    reps:repOverride,
    rest:cfg.rest,
    intensity:cfg.intensity,
    cue:item.exercise[2]
  }));
  return {
    title:`Rutina rápida · ${muscles.map((m)=>m[0].toUpperCase()+m.slice(1)).join(' + ')}`,
    level:levelKey,
    goal,
    duration,
    muscles,
    exercises,
    impact: goal === 'fuerza'
      ? 'Prioriza práctica técnica y producción de fuerza con descansos amplios.'
      : goal === 'resistencia'
        ? 'Prioriza tolerancia al volumen y capacidad de sostener repeticiones con buena técnica.'
        : 'Prioriza volumen efectivo para hipertrofia con esfuerzo controlado y progresión semanal.',
    warmup:'5–8 min de movilidad general + 2–3 series de aproximación del primer ejercicio.',
    progression:'Cuando completes el rango superior con técnica estable en todas las series, aumenta ligeramente carga o repeticiones la sesión siguiente.',
    safety:'Borrador para adultos sanos. Dolor agudo, lesión, embarazo, enfermedad cardiovascular/metabólica u otra condición requiere adaptación por un profesional cualificado.'
  };
}

export function routineWhatsappText(plan, clientName = '') {
  const greeting = clientName && clientName.toLowerCase() !== 'usuario test' ? `Hola ${clientName}. ` : 'Hola. ';
  return `${greeting}Tu entrenamiento de hoy:\n\n${plan.title}\nNivel: ${plan.level} · Objetivo: ${plan.goal} · ${plan.duration} min\n\n${plan.exercises.map((x)=>`${x.order}. ${x.name} — ${x.sets} series × ${x.reps} · descanso ${x.rest}\n   ${x.cue}`).join('\n')}\n\nCalentamiento: ${plan.warmup}\nImpacto buscado: ${plan.impact}\nProgresión: ${plan.progression}`;
}

function mifflin({ weightKg, heightCm, age, sex }) {
  const w = clamp(weightKg, 30, 300), h = clamp(heightCm, 120, 230), a = clamp(age, 16, 100);
  if (!w || !h || !a) return 0;
  const base = 10*w + 6.25*h - 5*a;
  return Math.round(base + (sex === 'female' ? -161 : sex === 'male' ? 5 : -78));
}

const MEAL_BANK = {
  desayuno:['Avena + yogur natural + fruta + huevos','Arepa integral + huevos + aguacate + fruta','Yogur alto en proteína + avena + fruta + semillas'],
  almuerzo:['Pollo o pavo + arroz/papa + ensalada grande','Carne magra + yuca/papa + vegetales','Lentejas o caraotas + arroz + vegetales + fuente de proteína'],
  cena:['Pescado + papa/batata + vegetales','Pollo + vegetales + arroz en porción ajustada','Tortilla de huevos + vegetales + arepa o tubérculo'],
  snack:['Fruta + yogur','Sándwich pequeño de proteína magra','Fruta + queso fresco o yogur']
};

export function generateNutritionDraft(input = {}) {
  const weightKg = clamp(input.weightKg, 30, 300);
  const goal = input.goal || 'mantener';
  const meals = clamp(input.meals || 4, 3, 6);
  const bmr = mifflin(input);
  const factor = ({sedentario:1.2, ligero:1.375, moderado:1.55, alto:1.725}[input.activity] || 1.45);
  const maintenance = bmr ? Math.round(bmr * factor) : 0;
  const targetCalories = maintenance ? Math.max(1200, Math.round(maintenance + (goal === 'bajar' ? -350 : goal === 'subir' ? 250 : 0))) : 0;
  const protein = weightKg ? { min:Math.round(weightKg*1.4), target:Math.round(weightKg*1.6), max:Math.round(weightKg*2.0) } : null;
  const days = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map((day, index)=>({
    day,
    breakfast:MEAL_BANK.desayuno[index % MEAL_BANK.desayuno.length],
    lunch:MEAL_BANK.almuerzo[index % MEAL_BANK.almuerzo.length],
    snack:MEAL_BANK.snack[index % MEAL_BANK.snack.length],
    dinner:MEAL_BANK.cena[index % MEAL_BANK.cena.length]
  }));
  return {
    goal, meals, weightKg, maintenance, targetCalories, protein, days,
    guidance: goal === 'bajar'
      ? 'Déficit moderado orientativo, priorizando saciedad, proteína, vegetales y adherencia.'
      : goal === 'subir'
        ? 'Superávit pequeño orientativo, priorizando progresión de entrenamiento y alimentos densos en nutrientes.'
        : 'Energía cercana a mantenimiento y distribución regular de proteína y vegetales.',
    safety:'Esto es una guía general de coaching, no una dieta clínica. Alergias, diabetes, enfermedad renal, embarazo, trastornos de la conducta alimentaria u otra condición requieren evaluación individual por nutricionista/médico.'
  };
}

export function nutritionWhatsappText(plan, clientName = '') {
  const greeting = clientName && clientName.toLowerCase() !== 'usuario test' ? `Hola ${clientName}.` : 'Plan orientativo:';
  const energy = plan.targetCalories ? `\nReferencia energética aproximada: ${plan.targetCalories} kcal/día.` : '';
  const protein = plan.protein ? `\nProteína orientativa: ${plan.protein.min}–${plan.protein.max} g/día (objetivo práctico ~${plan.protein.target} g).` : '';
  return `${greeting}\nObjetivo: ${plan.goal}.${energy}${protein}\n\n${plan.days.map((d)=>`${d.day}:\n• Desayuno: ${d.breakfast}\n• Almuerzo: ${d.lunch}\n• Snack: ${d.snack}\n• Cena: ${d.dinner}`).join('\n\n')}\n\n${plan.guidance}`;
}
