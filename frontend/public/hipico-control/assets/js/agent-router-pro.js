const AGENT = (id, label, domain, sideEffects = 'none') => Object.freeze({ id, label, domain, sideEffects });

export const PRO_AGENTS = Object.freeze({
  intake: AGENT('intake_sentinel', 'Centinela de ingreso', 'ingestion'),
  integrity: AGENT('integrity_guard', 'Integridad e idempotencia', 'integrity'),
  identity: AGENT('identity_resolver', 'Identidad y participantes', 'identity'),
  context: AGENT('race_context', 'Contexto de carrera', 'race'),
  horse: AGENT('horse_betting_specialist', 'Caballos y tercios', 'horse-betting'),
  parlay: AGENT('parlay_specialist', 'Parleys', 'parlay'),
  reply: AGENT('reply_correlator', 'Correlación de respuestas', 'correlation'),
  close: AGENT('closure_guard', 'Cierres y ventanas', 'closure'),
  result: AGENT('result_reader', 'Llegadas y pizarra', 'result'),
  risk: AGENT('risk_guard', 'Riesgo y cobertura', 'risk'),
  settlement: AGENT('settlement_auditor', 'Liquidación', 'settlement'),
  balance: AGENT('balance_reconciler', 'Saldos y conciliación', 'reconciliation'),
  publication: AGENT('publication_composer', 'Publicación', 'publication', 'outbox-only'),
  noise: AGENT('conversation_filter', 'Conversación y ruido', 'noise'),
  semantic: AGENT('semantic_escalation', 'Escalamiento semántico', 'ambiguity'),
  health: AGENT('operations_health_guard', 'Salud operacional', 'resilience'),
  supervisor: AGENT('operations_supervisor', 'Supervisor operacional', 'supervision', 'decision-only')
});

const ROUTES = Object.freeze({
  offer: 'horse', counteroffer: 'reply', reply_review: 'reply', confirmation: 'reply',
  race_open: 'context', race_close: 'close', day_close: 'close', late_message: 'close',
  result: 'result', plan_snapshot: 'publication', settlement_snapshot: 'settlement',
  balance_snapshot: 'balance', parlay: 'parlay', conversation: 'noise', other: 'noise'
});

const MONETARY_TYPES = new Set(['offer', 'counteroffer', 'confirmation', 'settlement_snapshot', 'balance_snapshot', 'parlay']);
const HIGH_RISK_TYPES = new Set(['confirmation', 'result', 'settlement_snapshot', 'balance_snapshot', 'day_close']);

export function routeOperationalEvent(event = {}, context = {}) {
  const key = ROUTES[event.type] || 'semantic';
  const confidence = Number(event.confidence ?? 0);
  const monetary = MONETARY_TYPES.has(event.type);
  const highRisk = HIGH_RISK_TYPES.has(event.type);
  const integrityIssue = Boolean(event.duplicateConflict || event.sequenceGap || context.gapDetected);
  const contextualIssue = Boolean(event.needsReview || event.requiresApproval || event.status === 'ambiguous' || event.status === 'conflict');
  const late = event.status === 'late_or_next_block' || event.type === 'late_message';
  const healthBlocked = context.health?.level === 'blocked';

  let decision = 'AUTO';
  const reasonCodes = [];
  if (healthBlocked || integrityIssue || late) decision = 'BLOCK';
  else if (contextualIssue || confidence < (monetary ? 0.995 : 0.98) || highRisk) decision = 'REVIEW';

  if (healthBlocked) reasonCodes.push('HEALTH_BLOCKED');
  if (integrityIssue) reasonCodes.push('INTEGRITY_GAP');
  if (late) reasonCodes.push('AFTER_CLOSE');
  if (contextualIssue) reasonCodes.push('AMBIGUOUS_CONTEXT');
  if (confidence < (monetary ? 0.995 : 0.98)) reasonCodes.push('LOW_CONFIDENCE');
  if (highRisk && decision !== 'BLOCK') reasonCodes.push('HIGH_RISK_GATE');

  return Object.freeze({
    specialist: PRO_AGENTS[key],
    supporting: [PRO_AGENTS.integrity, PRO_AGENTS.identity, PRO_AGENTS.context, PRO_AGENTS.health],
    supervisor: PRO_AGENTS.supervisor,
    monetary,
    highRisk,
    decision,
    reasonCodes,
    sideEffectPolicy: decision === 'AUTO' && !monetary ? 'outbox-eligible' : 'no-direct-side-effects'
  });
}

export function routeOperationalBatch(events = [], context = {}) {
  return events.map((event) => ({ ...event, routing: routeOperationalEvent(event, context) }));
}
