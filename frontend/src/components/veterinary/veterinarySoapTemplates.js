export const SOAP_TEMPLATE_VERSION='2026-09-v1';

const generic={
  id:'general-problem',
  speciesKey:'general',
  consultationType:'problem',
  label:'Consulta por problema',
  subjective:'Motivo principal, inicio y evolución de signos, apetito/agua, eliminación, actividad, medicación actual y antecedentes relevantes.',
  objective:'Estado general, hidratación, mucosas, TPR, peso, dolor, examen físico por sistemas y hallazgos relevantes.',
  assessment:'Lista de problemas, impresión clínica y diagnósticos diferenciales a confirmar. No asumir diagnóstico sin evidencia.',
  plan:'Pruebas/estudios indicados, tratamiento si corresponde, cuidados en casa, señales de alarma y fecha/criterio de control.'
};

export const VETERINARY_SOAP_TEMPLATES=Object.freeze([
  generic,
  {
    id:'canine-wellness',
    speciesKey:'canine',
    consultationType:'wellness',
    label:'Canino · control preventivo',
    subjective:'Estado general desde el último control, dieta, actividad, conducta, prevención antiparasitaria, vacunación, salud oral y cambios reportados por el tutor.',
    objective:'Peso/condición corporal, TPR, piel/pelaje, ojos/oídos, cavidad oral, cardiovascular, respiratorio, abdomen, locomotor y hallazgos preventivos.',
    assessment:'Estado preventivo actual, problemas activos identificados y riesgos que requieren seguimiento.',
    plan:'Plan preventivo individual, vacunas/desparasitación según registro y criterio profesional, nutrición, salud oral, actividad y próximo control.'
  },
  {
    id:'feline-wellness',
    speciesKey:'feline',
    consultationType:'wellness',
    label:'Felino · control preventivo',
    subjective:'Ambiente interior/exterior, dieta, ingesta de agua, arenero, conducta, actividad, prevención, vacunación y cambios recientes.',
    objective:'Peso/condición corporal, hidratación, TPR, cavidad oral, piel/pelaje, ojos/oídos, cardiovascular, respiratorio, abdomen y locomotor.',
    assessment:'Estado preventivo actual, problemas activos y factores de riesgo identificados.',
    plan:'Prevención individual, manejo ambiental/nutricional, salud oral, controles indicados y próximo seguimiento.'
  },
  {
    id:'general-follow-up',
    speciesKey:'general',
    consultationType:'follow_up',
    label:'Seguimiento / reevaluación',
    subjective:'Evolución desde la última consulta, adherencia/tolerancia al tratamiento, signos resueltos/persistentes/nuevos y observaciones del tutor.',
    objective:'Reevaluación dirigida de hallazgos previos, signos vitales relevantes y nuevos hallazgos.',
    assessment:'Respuesta al tratamiento, problemas activos/resueltos y necesidad de ajustar hipótesis o prioridades.',
    plan:'Continuar/modificar/suspender según criterio profesional, pruebas de seguimiento y próximo control.'
  },
  {
    id:'general-emergency',
    speciesKey:'general',
    consultationType:'emergency',
    label:'Urgencia / emergencia',
    subjective:'Evento actual, hora de inicio, mecanismo/contexto, progresión, tratamiento previo, tóxicos/trauma posibles y antecedentes críticos.',
    objective:'Triage y estabilidad: vía aérea, respiración, circulación, perfusión, estado neurológico, temperatura, dolor y hallazgos inmediatos.',
    assessment:'Problemas priorizados por gravedad y diagnósticos diferenciales urgentes.',
    plan:'Estabilización indicada, monitorización, pruebas prioritarias, tratamiento inmediato y comunicación con el tutor.'
  }
]);

const normalizeSpecies=(value='')=>{
  const species=String(value).trim().toLowerCase();
  if(/dog|canin|perro/.test(species))return 'canine';
  if(/cat|felin|gato/.test(species))return 'feline';
  return 'general';
};

export const resolveVeterinarySoapTemplate=({species='',consultationType='problem'}={})=>{
  const speciesKey=normalizeSpecies(species);
  return VETERINARY_SOAP_TEMPLATES.find((template)=>template.speciesKey===speciesKey&&template.consultationType===consultationType)
    || VETERINARY_SOAP_TEMPLATES.find((template)=>template.speciesKey==='general'&&template.consultationType===consultationType)
    || generic;
};

export const veterinaryConsultationTypes=Object.freeze([
  {value:'wellness',label:'Control preventivo'},
  {value:'problem',label:'Consulta por problema'},
  {value:'follow_up',label:'Seguimiento'},
  {value:'emergency',label:'Urgencia / emergencia'}
]);
