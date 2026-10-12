import { normalize } from './runtime-utils.mjs';

// Presentation-only LAB skill. This module has no model, tools, HTTP or write authority.
// The backend remains the sole source for canonical racing facts.
export const DEFAULT_LAB_ASSISTANT_NAME = 'Asistente Hípico';
const CANONICAL_READ_STATUSES = new Set([
  'CANONICAL_STATE_FOUND', 'CANONICAL_RACE_NOT_FOUND',
  'CANONICAL_RACE_UNVERIFIED', 'EXPLICIT_RACE_CONTEXT_REQUIRED',
  'INVALID_RACE_CONTEXT'
]);

export function normalizeLabAssistantName(value) {
  const name = String(value || '').trim();
  return name.length >= 2 && name.length <= 32 &&
    /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(name)
    ? name : DEFAULT_LAB_ASSISTANT_NAME;
}

function raceReference(plan) {
  const number = plan?.raceNumber;
  if (!Number.isInteger(number) || number < 1 || number > 99) return '';
  const scope = plan?.raceScope;
  return scope?.raceNumber === number
    ? `carrera ${number} en ${scope.racetrack} del ${scope.raceDate}`
    : `carrera ${number}`;
}

export function composeLabAssistantReply({ classification, plan, canonical, assistantName } = {}) {
  const name = normalizeLabAssistantName(assistantName);
  const risk = classification?.risk || 'review';
  if (risk !== 'safe') {
    return 'Entiendo el mensaje, pero necesita revisión de un operador. No registré ni confirmé ninguna operación.';
  }

  const reference = raceReference(plan);
  if (plan?.summaryRequested) {
    return reference
      ? `Hasta ahora tengo como referencia la ${reference}. Es solo contexto de esta conversación: no he revisado el historial completo ni puedo confirmar operaciones o resultados sin consultar los registros.`
      : 'Puedo resumir la referencia de carrera que vayamos consultando, pero no tengo un historial completo verificado para resumir. ¿Qué carrera quieres revisar?';
  }

  if (canonical?.available === true && CANONICAL_READ_STATUSES.has(canonical.reason)
    && typeof canonical.text === 'string' && canonical.text.length <= 1500) {
    if (canonical.reason === 'CANONICAL_STATE_FOUND') return `Claro. ${canonical.text}`;
    return canonical.text;
  }
  if (canonical?.reason === 'REVIEW_REQUIRED') {
    return 'Para darte información confiable necesito que un operador revise esa consulta. No se hizo ningún cambio.';
  }

  if (plan?.queryCategory === 'UNSUPPORTED') {
    return reference
      ? 'Tengo la referencia de la ' + reference + ', pero todavía no dispongo de una consulta verificada para esos datos en el LAB. Por ahora solo puedo comprobar el estado interno de la carrera; no voy a inventar participantes, resultados ni horarios.'
      : 'Todavía no dispongo de una consulta verificada para esos datos en el LAB. Puedo revisar el estado interno de una carrera cuando me indiques número, hipódromo y fecha.';
  }
  if (classification?.intent === 'greeting') {
    return `¡Buenas! Soy ${name}, el asistente virtual de Control Hípico. Puedo ayudarte a consultar carreras y aclarar dudas. ¿Qué necesitas?`;
  }
  if (classification?.intent === 'help') {
    return 'Con gusto. Puedo consultar el estado registrado de una carrera si me dices número, hipódromo y fecha (AAAA-MM-DD). También puedo recordar esa referencia y darte un resumen breve del contexto. Las operaciones sensibles requieren revisión.';
  }

  const normalized = normalize(plan?.guidance);
  if (plan?.isQuestion || normalized.includes('consulta')) {
    if (plan?.raceScope) {
      return `Tengo la referencia de la ${reference}, pero ahora no puedo verificar su estado en el sistema. Prefiero no inventarte una respuesta.`;
    }
    if (reference) {
      return `Claro, revisamos la ${reference}. ¿Me confirmas el hipódromo y la fecha (AAAA-MM-DD) para consultar el registro correcto?`;
    }
    return 'Claro, ¿me dices el número de carrera, el hipódromo y la fecha (AAAA-MM-DD)? Así consulto el registro correcto.';
  }
  return 'Estoy pendiente por aquí. Si quieres consultar una carrera, dime cuál y te ayudo con los datos disponibles.';
}
