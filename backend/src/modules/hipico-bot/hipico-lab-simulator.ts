import crypto from 'node:crypto';
import { decideConversation, nextConversationContext, type ConversationContext, type ConversationDecision, type ConversationMessage } from './hipico-conversation-engine.js';

export type LabParticipant = { id: string; alias: string };
export type LabEvent = {
  id: string;
  participantId: string;
  atMs: number;
  text: string;
  raceId?: string | null;
  quotedSourceMessageId?: string | null;
  mediaKind?: string | null;
  duplicateOf?: string | null;
  expectedDecision?: ConversationDecision['decision'] | null;
};
export type LabScenario = {
  id: string;
  title: string;
  seed: string;
  participants: LabParticipant[];
  activeRaceId?: string | null;
  closedRaceIds?: string[];
  events: LabEvent[];
};

export type LabTranscriptRow = {
  sequence: number;
  eventId: string;
  participantId: string;
  alias: string;
  sourceMessageId: string;
  timestamp: string;
  text: string;
  decision: ConversationDecision;
  expectedDecision: string | null;
  expectedMatch: boolean | null;
};

export type LabRunResult = {
  scenarioId: string;
  scenarioTitle: string;
  startedAt: string;
  deterministicEpoch: string;
  participants: number;
  eventCount: number;
  transcript: LabTranscriptRow[];
  findings: Array<{ code: string; eventId: string; detail: string }>;
  summary: { pass: number; fail: number; duplicateResponses: number; lostDecisions: number; contextLeaks: number };
  stateHash: string;
  transcriptHash: string;
  finalContext: {
    seenSourceMessageIds: string[];
    lastTimestampByParticipant: Record<string, string>;
    activeRaceId: string | null;
    closedRaceIds: string[];
  };
};

const BASE_EPOCH = Date.parse('2026-08-29T12:00:00.000Z');

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function sha256(value: unknown) {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}
function canonical(value: string) { return String(value || '').trim().toLowerCase(); }

export function sanitizeImportedCorpusRow(input: Record<string, unknown>, index = 0): LabEvent {
  const text = String(input.text || input.body || '').slice(0, 4000);
  const aliasSource = String(input.participantId || input.senderAlias || input.sender || `import-${index}`);
  const participantHash = crypto.createHash('sha256').update(aliasSource).digest('hex').slice(0, 12);
  const quoted = String(input.quotedSourceMessageId || input.quotedExternalMessageId || '').trim();
  return {
    id: `import-${index}-${crypto.createHash('sha256').update(`${participantHash}|${text}`).digest('hex').slice(0, 10)}`,
    participantId: `synthetic-${participantHash}`,
    atMs: Number.isFinite(Number(input.atMs)) ? Math.max(0, Number(input.atMs)) : index * 1000,
    text,
    raceId: input.raceId == null ? null : String(input.raceId),
    quotedSourceMessageId: quoted || null,
    mediaKind: input.mediaKind == null ? 'none' : String(input.mediaKind)
  };
}

export function importSanitizedCorpus(rows: Array<Record<string, unknown>>, scenarioId = 'imported-sanitized'): LabScenario {
  const events = rows.map(sanitizeImportedCorpusRow);
  const participantIds = [...new Set(events.map((event) => event.participantId))];
  return {
    id: scenarioId,
    title: 'Corpus histórico sanitizado para LAB',
    seed: sha256(rows).slice(0, 16),
    participants: participantIds.map((id, index) => ({ id, alias: `Tester ${index + 1}` })),
    events
  };
}

function sourceMessageId(event: LabEvent) {
  return event.duplicateOf ? event.duplicateOf : event.id;
}

function contextSnapshot(context: ConversationContext) {
  const seen = context.seenSourceMessageIds instanceof Set
    ? [...context.seenSourceMessageIds]
    : [...(context.seenSourceMessageIds || [])];
  const closed = context.closedRaceIds instanceof Set ? [...context.closedRaceIds] : [...(context.closedRaceIds || [])];
  return {
    seenSourceMessageIds: seen.sort(),
    lastTimestampByParticipant: { ...(context.lastTimestampByParticipant || {}) },
    activeRaceId: context.activeRaceId || null,
    closedRaceIds: closed.map(String).sort()
  };
}

export function runLabScenario(scenario: LabScenario, options: { epochMs?: number } = {}): LabRunResult {
  const epochMs = Number.isFinite(options.epochMs) ? Number(options.epochMs) : BASE_EPOCH;
  const participantMap = new Map(scenario.participants.map((participant) => [participant.id, participant]));
  let context: ConversationContext = {
    seenSourceMessageIds: new Set<string>(),
    lastTimestampByParticipant: {},
    activeRaceId: scenario.activeRaceId || null,
    closedRaceIds: new Set((scenario.closedRaceIds || []).map(String)),
    humanOwnedParticipantIds: new Set<string>()
  };
  const transcript: LabTranscriptRow[] = [];
  const findings: LabRunResult['findings'] = [];
  const responseKeys = new Set<string>();
  let duplicateResponses = 0;
  let lostDecisions = 0;
  let contextLeaks = 0;
  let pass = 0;
  let fail = 0;

  const ordered = scenario.events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.atMs - b.event.atMs || a.index - b.index);

  for (let sequence = 0; sequence < ordered.length; sequence += 1) {
    const event = ordered[sequence].event;
    const participant = participantMap.get(event.participantId);
    if (!participant) {
      findings.push({ code: 'UNKNOWN_PARTICIPANT', eventId: event.id, detail: `No existe ${event.participantId} en participants.` });
      fail += 1;
      continue;
    }
    const message: ConversationMessage = {
      sourceMessageId: sourceMessageId(event),
      participantId: event.participantId,
      text: event.text,
      timestamp: new Date(epochMs + Math.max(0, event.atMs)).toISOString(),
      raceId: event.raceId || context.activeRaceId || null,
      quotedSourceMessageId: event.quotedSourceMessageId || null,
      mediaKind: event.mediaKind || 'none'
    };
    let decision: ConversationDecision;
    try {
      decision = decideConversation(message, context);
    } catch (error) {
      findings.push({ code: 'LOST_DECISION', eventId: event.id, detail: error instanceof Error ? error.message : String(error) });
      lostDecisions += 1;
      fail += 1;
      continue;
    }

    const responseKey = `${decision.sourceMessageId}|${decision.policyVersion}`;
    if (decision.responseIntent !== 'NONE' && responseKeys.has(responseKey)) {
      findings.push({ code: 'DUPLICATE_RESPONSE', eventId: event.id, detail: responseKey });
      duplicateResponses += 1;
    }
    if (decision.responseIntent !== 'NONE') responseKeys.add(responseKey);

    const expectedMatch = event.expectedDecision ? decision.decision === event.expectedDecision : null;
    if (expectedMatch === false) {
      findings.push({ code: 'EXPECTED_DECISION_MISMATCH', eventId: event.id, detail: `esperado=${event.expectedDecision} actual=${decision.decision}` });
      fail += 1;
    } else {
      pass += 1;
    }

    if (canonical(decision.participantId) !== canonical(event.participantId)) {
      findings.push({ code: 'CONTEXT_LEAK', eventId: event.id, detail: `decision participant=${decision.participantId}` });
      contextLeaks += 1;
      fail += 1;
    }

    transcript.push({
      sequence,
      eventId: event.id,
      participantId: event.participantId,
      alias: participant.alias,
      sourceMessageId: message.sourceMessageId,
      timestamp: message.timestamp,
      text: event.text,
      decision,
      expectedDecision: event.expectedDecision || null,
      expectedMatch
    });
    context = nextConversationContext(context, message, decision);
  }

  const finalContext = contextSnapshot(context);
  const transcriptForHash = transcript.map((row) => ({
    eventId: row.eventId,
    sourceMessageId: row.sourceMessageId,
    participantId: row.participantId,
    timestamp: row.timestamp,
    decision: row.decision.decision,
    decisionReason: row.decision.decisionReason,
    correlationId: row.decision.correlationId
  }));

  return {
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    startedAt: new Date(epochMs).toISOString(),
    deterministicEpoch: new Date(epochMs).toISOString(),
    participants: scenario.participants.length,
    eventCount: scenario.events.length,
    transcript,
    findings,
    summary: { pass, fail, duplicateResponses, lostDecisions, contextLeaks },
    stateHash: sha256(finalContext),
    transcriptHash: sha256(transcriptForHash),
    finalContext
  };
}

export function assertLabRunSafe(result: LabRunResult) {
  if (result.summary.lostDecisions > 0) throw new Error(`LAB perdió ${result.summary.lostDecisions} decisión(es).`);
  if (result.summary.duplicateResponses > 0) throw new Error(`LAB produjo ${result.summary.duplicateResponses} respuesta(s) duplicada(s).`);
  if (result.summary.contextLeaks > 0) throw new Error(`LAB detectó ${result.summary.contextLeaks} fuga(s) de contexto.`);
  if (result.summary.fail > 0) throw new Error(`LAB tiene ${result.summary.fail} caso(s) fallido(s).`);
  return true;
}
