import { FitnessRoutineService } from './fitnessRoutineService.js';
import { FitnessNutritionService } from './fitnessNutritionService.js';

const AGENTS=Object.freeze({
  veterinary:{
    id:'veterinary-operations-agent',label:'Agente Veterinaria',scope:'Flujo de atención, expediente, vacunas, estudios, hospitalización y seguimiento.',
    guard:'No diagnostica ni prescribe automáticamente; organiza el expediente y señala datos faltantes para revisión profesional.'
  },
  psychology:{
    id:'psychology-practice-agent',label:'Agente Psicología',scope:'Agenda, preparación de sesión, seguimiento, consentimientos y continuidad administrativa.',
    guard:'No sustituye evaluación clínica ni genera diagnósticos; protege notas sensibles y prioriza consentimiento/seguimiento.'
  },
  dentistry:{
    id:'dentistry-workflow-agent',label:'Agente Odontología',scope:'Agenda, odontograma, procedimientos, estudios, presupuestos y controles.',
    guard:'No decide tratamientos de forma autónoma; estructura hallazgos y pasos administrativos para validación odontológica.'
  },
  fitness:{
    id:'fitness-coach-agent',label:'Agente Entrenador',scope:'Rutinas rápidas, grupos musculares, nivel, volumen, descansos, técnica y WhatsApp.',
    guard:'El entrenador conserva la decisión final y ajusta cargas, técnica y ejercicios según la persona y el entorno.'
  },
  nutrition:{
    id:'nutrition-planner-agent',label:'Agente Nutrición',scope:'Planificación orientativa por objetivo, días, preferencias, calorías/macros y mensajes.',
    guard:'Bloquea automatización ante banderas clínicas; no reemplaza una valoración nutricional individual.'
  }
});

const item=(severity,title,detail,action='')=>({severity,title,detail,action});

export const VerticalAgentService={
  agents:AGENTS,
  describe(vertical){return AGENTS[vertical]||null;},
  run(vertical,context={}){
    if(vertical==='fitness')return{agent:AGENTS.fitness,output:FitnessRoutineService.generate(context)};
    if(vertical==='nutrition')return{agent:AGENTS.nutrition,output:FitnessNutritionService.generate(context)};
    const recommendations=[];
    if(vertical==='veterinary'){
      if(!context.patientId)recommendations.push(item('warning','Selecciona paciente','El flujo clínico debe quedar asociado a una mascota antes de registrar actos o estudios.','Abrir ficha de mascota'));
      if(context.appointment&&!context.professionalId)recommendations.push(item('warning','Asignar profesional','La cita todavía no tiene profesional responsable.','Asignar veterinario'));
      if(context.hospitalized&&!context.observationRecent)recommendations.push(item('danger','Observación pendiente','La hospitalización necesita una observación/vitales recientes según el protocolo del centro.','Registrar observación'));
      if(context.labOrder&&!context.labResult)recommendations.push(item('info','Resultado pendiente','Hay una orden de laboratorio sin resultado asociado.','Revisar laboratorio'));
      if(!recommendations.length)recommendations.push(item('success','Expediente operativo','No se detectaron faltantes administrativos en el contexto recibido.','Continuar revisión profesional'));
      return{agent:AGENTS.veterinary,recommendations};
    }
    if(vertical==='psychology'){
      if(!context.patientId)recommendations.push(item('warning','Selecciona paciente','La agenda/sesión debe asociarse a un paciente antes de registrar seguimiento.','Seleccionar paciente'));
      if(context.session&&context.consentRequired&&!context.consentRecorded)recommendations.push(item('danger','Consentimiento pendiente','El expediente indica que falta registrar el consentimiento requerido.','Registrar consentimiento'));
      if(context.followUpDue)recommendations.push(item('info','Seguimiento pendiente','Existe un seguimiento administrativo/agenda que conviene programar.','Programar contacto'));
      if(context.sensitiveNote)recommendations.push(item('info','Nota sensible','Mantén el contenido clínico sensible fuera de mensajes generales y vistas no autorizadas.','Revisar privacidad'));
      if(!recommendations.length)recommendations.push(item('success','Agenda preparada','No se detectaron faltantes administrativos en el contexto recibido.','Continuar sesión'));
      return{agent:AGENTS.psychology,recommendations};
    }
    if(vertical==='dentistry'){
      if(!context.patientId)recommendations.push(item('warning','Selecciona paciente','El odontograma y el procedimiento deben quedar ligados al paciente.','Seleccionar paciente'));
      if(context.procedure&&!context.tooth)recommendations.push(item('warning','Pieza dental faltante','El procedimiento requiere identificar la pieza o dejar constancia de que es general.','Seleccionar pieza'));
      if(context.imagingRequired&&!context.imagingRecorded)recommendations.push(item('info','Estudio pendiente','El flujo indica estudio/radiografía pendiente de anexar.','Adjuntar estudio'));
      if(context.followUpDays&&!context.followUpScheduled)recommendations.push(item('info','Control pendiente',`El procedimiento tiene un control sugerido en ${Number(context.followUpDays)} día(s) y aún no hay cita.`, 'Programar control'));
      if(!recommendations.length)recommendations.push(item('success','Ficha preparada','No se detectaron faltantes administrativos en el contexto recibido.','Validar tratamiento'));
      return{agent:AGENTS.dentistry,recommendations};
    }
    return{agent:null,recommendations:[item('info','Sin agente','No existe un agente vertical para este contexto.')]};
  }
};
