export const CHAT_AGENTS = Object.freeze({
  intake: {
    id: 'intake_sentinel',
    label: 'Centinela de Ingreso',
    purpose: 'Persistir y deduplicar antes de interpretar.'
  },
  identity: {
    id: 'identity_resolver',
    label: 'Identidad y Participantes',
    purpose: 'Resolver teléfono, alias, código y rol del remitente.'
  },
  race: {
    id: 'race_context',
    label: 'Contexto de Carrera',
    purpose: 'Resolver hipódromo, carrera, segmento y estado operativo.'
  },
  horse: {
    id: 'horse_offer',
    label: 'Tercios y Caballos',
    purpose: 'Interpretar ofertas Juega/Consigue y notación hípica.'
  },
  parlay: {
    id: 'parlay_reader',
    label: 'Parleys',
    purpose: 'Separar tickets multi-selección del motor hípico.'
  },
  reply: {
    id: 'reply_correlator',
    label: 'Respuestas y Correlación',
    purpose: 'Relacionar 30k, J, Jugando, Sf y respuestas citadas con su solicitud origen.'
  },
  closure: {
    id: 'closure_guard',
    label: 'Cierres',
    purpose: 'Aplicar cierre de carrera/jornada y marcar operaciones tardías.'
  },
  result: {
    id: 'result_reader',
    label: 'Llegadas y Pizarra',
    purpose: 'Extraer y validar resultados sin confundir número de carrera con posiciones.'
  },
  settlement: {
    id: 'settlement_auditor',
    label: 'Liquidación',
    purpose: 'Comparar liquidación publicada con el motor y el ledger.'
  },
  balance: {
    id: 'balance_reconciler',
    label: 'Disponibles y Conciliación',
    purpose: 'Comparar snapshots de disponibles contra saldos internos sin sobrescribir historia.'
  },
  noise: {
    id: 'conversation_filter',
    label: 'Conversación y Ruido',
    purpose: 'Archivar mensajes no operativos sin responder ni crear apuestas.'
  },
  risk: {
    id: 'risk_guard',
    label: 'Riesgo y Cobertura',
    purpose: 'Validar disponible, aval, exposición y excedentes antes de confirmar.'
  },
  publication: {
    id: 'publication_composer',
    label: 'Publicación',
    purpose: 'Generar acuses, plano, liquidación, disponibles y cierre desde datos confirmados.'
  },
  semantic: {
    id: 'semantic_escalation',
    label: 'Escalamiento Semántico',
    purpose: 'Analizar únicamente ambigüedades que las reglas determinísticas no resuelven.'
  },
  supervisor: {
    id: 'operations_supervisor',
    label: 'Supervisor Operacional',
    purpose: 'Decidir si automatizar, pedir revisión o bloquear una acción monetaria.'
  }
});

const EVENT_AGENT = Object.freeze({
  offer: 'horse',
  reply_review: 'reply',
  race_close: 'closure',
  day_close: 'closure',
  result: 'result',
  plan_snapshot: 'publication',
  settlement_snapshot: 'settlement',
  balance_snapshot: 'balance',
  parlay: 'parlay',
  other: 'noise'
});

export function routeEventToAgent(event = {}) {
  const key = EVENT_AGENT[event.type] || 'semantic';
  const specialist = CHAT_AGENTS[key];
  const reviewRequired = Boolean(
    event.status === 'late_or_next_block' ||
    event.status === 'conflict' ||
    event.status === 'ambiguous' ||
    event.requiresApproval ||
    event.needsReview
  );
  return {
    specialist,
    supporting: [CHAT_AGENTS.identity, CHAT_AGENTS.race],
    supervisor: CHAT_AGENTS.supervisor,
    reviewRequired,
    monetaryGate: ['offer', 'settlement_snapshot', 'balance_snapshot'].includes(event.type),
    autoReplyEligible: !reviewRequired && ['offer', 'race_close', 'day_close', 'result'].includes(event.type)
  };
}

export function routeOperationalEvents(events = []) {
  return events.map((event) => ({ ...event, routing: routeEventToAgent(event) }));
}
