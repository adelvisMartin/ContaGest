import type { IntentResult } from './hipico-operational-classifier.js';
import type { LabRaceQuestion } from './hipico-lab-canonical-read.js';
import type { LabSchedulePurpose } from './hipico-lab-schedule-read.js';

const PROHIBITED=/\b(?:apostar|apuesta|jugada|juega|consigue|pag[oa]r?|cobrar|depositar|retirar|saldo|abonar|liquidar|cerrar|abrir|registrar|editar|actualizar|cancelar|confirmar|monto|dinero|bs|usdt|pago|premio)\b|\$/i;
const TOPICS:Record<LabRaceQuestion|LabSchedulePurpose,RegExp>={
  next:/\b(?:proxima carrera|carrera sigue|siguiente carrera)\b/,
  active:/\b(?:carrera activa|carrera abierta|cual esta abierta)\b/,
  schedule:/\b(?:programacion|cartelera|programa de carreras|carreras programadas)\b/,
  status:/\b(?:estado|estatus|situacion|abierta|cerrada|como\s+va)\b/,
  result:/\b(?:resultado|llegada|pizarra|ganador|gano|primer[oa]|segund[oa]|tercer[oa])\b/,
  participants:/\b(?:participantes|ejemplares|caballos|inscritos|quienes\s+corren)\b/,
  summary:/\b(?:resumen|resumeme|sintesis|recapitulacion)\b/
};
export function isLabInformationRequest(text:string,purpose:LabRaceQuestion|LabSchedulePurpose,result:Pick<IntentResult,'intent'|'risk'>){
  const normalized=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  if(normalized.length<6||normalized.length>1200||PROHIBITED.test(normalized)||
     !TOPICS[purpose]?.test(normalized)||result.risk==='monetary')return false;
  // A race summary is not a chat transcript, money recap or participant history.
  if(purpose==='summary' && /\b(?:chat|conversacion|mensajes?|historial|hablamos)\b/.test(normalized))return false;
  if(purpose==='summary' && !/\b(?:carrera|hipodromo)\b/.test(normalized))return false;
  // Race-result parsing with an explicit board is a proposed state mutation,
  // never an informational question.
  if(!['conversation','status_non_monetary','help'].includes(result.intent))return false;
  return /[?¿]/.test(text)||/^(?:estado|resultado|pizarra|participantes|caballos|ejemplares|inscritos|resumen|resumeme|sintesis|recapitulacion|dame|hazme|consulta|dime|muestra|indica|quienes|cual|como)\b/.test(normalized);
}
