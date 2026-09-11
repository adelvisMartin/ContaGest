import { Router } from 'express';
import { z } from 'zod';
import { classifyUntrustedConversation, safePublicAbuseMetadata } from './hipico-conversation-appsec.js';
import { effectiveBridgeMediaKind } from './hipico-bridge-input-policy.js';
import { persistHipicoDomainEvent } from './hipico-domain-event.store.js';
import { readHipicoDomainAggregate } from './hipico-domain-query.store.js';
import { operatorTokenConfigured, operatorTokenValid } from './hipico-operator-security.js';
import { operationalRaceContextKey } from './hipico-race-context-key.js';
import type { HipicoDomainEventType } from './hipico-domain-state.js';

export const HIPICO_CANONICAL_API_VERSION = 'v1';

const STATE_ADVANCING_EVENTS = new Set<HipicoDomainEventType>([
  'PLAN_RECORDED', 'RACE_OPENED', 'RACE_CLOSED', 'RESULT_RECORDED', 'SETTLEMENT_READY',
  'SETTLEMENT_RECORDED', 'BALANCE_CONFIRMED', 'RACE_PUBLISHED', 'RACE_ARCHIVED',
  'DAY_OPENED', 'DAY_CLOSING', 'DAY_CLOSED', 'DAY_ARCHIVED'
]);
const EXPLICIT_OPERATOR_EVENTS = new Set<HipicoDomainEventType>(['CORRECTION', 'REVERSAL']);
const RACE_ONLY_EVENTS = new Set<HipicoDomainEventType>([
  'PLAN_RECORDED', 'RACE_OPENED', 'BET_RECORDED', 'RACE_CLOSED', 'RESULT_RECORDED',
  'SETTLEMENT_READY', 'SETTLEMENT_RECORDED', 'BALANCE_CONFIRMED', 'RACE_PUBLISHED', 'RACE_ARCHIVED'
]);
const DAY_ONLY_EVENTS = new Set<HipicoDomainEventType>(['DAY_OPENED', 'DAY_CLOSING', 'DAY_CLOSED', 'DAY_ARCHIVED']);
const RACE_CONTEXT_ANCHOR_EVENTS = new Set<HipicoDomainEventType>(['PLAN_RECORDED', 'RACE_OPENED', 'RACE_CLOSED']);

const aggregateKindSchema = z.enum(['race', 'day']);
const mediaKindSchema = z.enum(['none', 'image', 'video', 'audio', 'document', 'unknown']);
const eventTypeSchema = z.enum([
  'PLAN_RECORDED', 'RACE_OPENED', 'BET_RECORDED', 'RACE_CLOSED', 'RESULT_RECORDED',
  'SETTLEMENT_READY', 'SETTLEMENT_RECORDED', 'BALANCE_CONFIRMED', 'RACE_PUBLISHED',
  'RACE_ARCHIVED', 'DAY_OPENED', 'DAY_CLOSING', 'DAY_CLOSED', 'DAY_ARCHIVED',
  'CORRECTION', 'REVERSAL', 'AMBIGUOUS', 'UNKNOWN'
]);

const previewSchema = z.object({
  groupKey: z.string().trim().min(1).max(120),
  text: z.string().max(4000).default(''),
  hasMedia: z.boolean().default(false),
  mediaKind: mediaKindSchema.default('none'),
  quoteDepth: z.number().int().min(0).max(20).default(0),
  participantId: z.string().trim().min(1).max(220).default('operator-preview')
}).strict();

const domainReadSchema = z.object({
  groupKey: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(200).default(50)
}).strict();

const domainEventSchema = z.object({
  groupKey: z.string().trim().min(1).max(120),
  aggregateKind: aggregateKindSchema,
  aggregateKey: z.string().trim().min(1).max(180),
  sourceMessageKey: z.string().trim().min(1).max(320),
  sourceMessageId: z.string().trim().max(320).nullable().optional(),
  eventType: eventTypeSchema,
  timestamp: z.string().datetime({ offset: true }),
  rawMessage: z.string().max(4000).nullable().optional(),
  normalizedPayload: z.unknown().optional(),
  originalEventId: z.string().trim().max(180).nullable().optional(),
  parserVersion: z.string().trim().max(120).nullable().optional(),
  operatorId: z.string().trim().min(1).max(220),
  confirmedOperatorAction: z.boolean().default(false),
  confirmationReason: z.string().trim().max(500).nullable().optional()
}).strict();

type DomainEventBody = z.infer<typeof domainEventSchema>;
type CanonicalPolicyInput = Pick<DomainEventBody, 'eventType' | 'confirmedOperatorAction' | 'confirmationReason'>
  & Partial<Pick<DomainEventBody, 'aggregateKind' | 'aggregateKey' | 'normalizedPayload' | 'originalEventId'>>;

export function configuredCanonicalOwnerId(env: NodeJS.ProcessEnv = process.env) {
  const value = String(env.HIPICO_OWNER_ID || '').trim();
  return z.string().uuid().safeParse(value).success ? value : null;
}

export function canonicalRequiresReview(input: Pick<DomainEventBody, 'eventType' | 'confirmedOperatorAction' | 'confirmationReason'>) {
  if (input.eventType === 'AMBIGUOUS' || input.eventType === 'UNKNOWN') return true;
  const explicit = STATE_ADVANCING_EVENTS.has(input.eventType) || EXPLICIT_OPERATOR_EVENTS.has(input.eventType);
  if (!explicit) return false;
  return !(input.confirmedOperatorAction && String(input.confirmationReason || '').trim().length >= 5);
}

function payloadRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonEmptyText(value: unknown, max = 220) {
  const text = String(value ?? '').trim();
  return text.length > 0 && text.length <= max;
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function canonicalRaceContextKey(input: Pick<CanonicalPolicyInput, 'eventType' | 'normalizedPayload'>) {
  if (!RACE_CONTEXT_ANCHOR_EVENTS.has(input.eventType)) return null;
  const payload = payloadRecord(input.normalizedPayload);
  const raceNumber = payload?.raceNumber;
  const racetrack = payload?.racetrack;
  if (payload?.raceContextComplete !== true || !Number.isInteger(raceNumber) || !nonEmptyText(racetrack, 120)) return null;
  return operationalRaceContextKey({ raceNumber: Number(raceNumber), racetrack: String(racetrack) });
}

export function canonicalScopeIssue(input: CanonicalPolicyInput) {
  if (input.aggregateKind) {
    if (RACE_ONLY_EVENTS.has(input.eventType) && input.aggregateKind !== 'race') return 'HIPICO_EVENT_AGGREGATE_KIND_MISMATCH';
    if (DAY_ONLY_EVENTS.has(input.eventType) && input.aggregateKind !== 'day') return 'HIPICO_EVENT_AGGREGATE_KIND_MISMATCH';
  }
  if (input.aggregateKind === 'race' && RACE_CONTEXT_ANCHOR_EVENTS.has(input.eventType)) {
    const expectedAggregateKey = canonicalRaceContextKey(input);
    if (expectedAggregateKey && input.aggregateKey && String(input.aggregateKey).trim() !== expectedAggregateKey) {
      return 'HIPICO_RACE_AGGREGATE_KEY_MISMATCH';
    }
  }
  if (EXPLICIT_OPERATOR_EVENTS.has(input.eventType) && !String(input.originalEventId || '').trim()) {
    return 'HIPICO_ORIGINAL_EVENT_REQUIRED';
  }
  return null;
}

export function canonicalEvidenceIssue(input: CanonicalPolicyInput) {
  const payload = payloadRecord(input.normalizedPayload);
  if (RACE_CONTEXT_ANCHOR_EVENTS.has(input.eventType)) {
    const raceNumber = payload?.raceNumber;
    const racetrack = payload?.racetrack;
    const complete = payload?.raceContextComplete;
    if (!Number.isInteger(raceNumber) || Number(raceNumber) < 1 || Number(raceNumber) > 999 || !nonEmptyText(racetrack, 120) || complete !== true) {
      return 'HIPICO_RACE_CONTEXT_INCOMPLETE';
    }
  }
  if (input.eventType === 'RESULT_RECORDED') {
    const board = payload?.board;
    if (!Array.isArray(board) || board.length < 1 || board.length > 20 || board.some((entry) => !nonEmptyText(entry, 80))) {
      return 'HIPICO_RESULT_BOARD_REQUIRED';
    }
  }
  if (input.eventType === 'SETTLEMENT_RECORDED') {
    const rows = payload?.settlementRows;
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500 || rows.some((row) => {
      const item = payloadRecord(row);
      return !item || !nonEmptyText(item.participant, 220) || !finiteNumber(item.amount);
    })) return 'HIPICO_SETTLEMENT_ROWS_REQUIRED';
  }
  if (input.eventType === 'BALANCE_CONFIRMED') {
    const balances = payload?.balances;
    if (!Array.isArray(balances) || balances.length < 1 || balances.length > 500 || balances.some((row) => {
      const item = payloadRecord(row);
      return !item || !nonEmptyText(item.participant, 220) || !finiteNumber(item.available);
    })) return 'HIPICO_BALANCES_REQUIRED';
  }
  return null;
}

export function canonicalMutationPolicy(input: CanonicalPolicyInput) {
  const evidenceIssue = canonicalEvidenceIssue(input);
  const requiresReview = canonicalRequiresReview(input) || Boolean(evidenceIssue);
  return {
    requiresReview,
    evidenceIssue,
    sourceWrite: false as const,
    monetaryWrite: false as const,
    stateWriteEligible: STATE_ADVANCING_EVENTS.has(input.eventType) && !requiresReview,
    evidenceOnly: input.eventType === 'BET_RECORDED' || EXPLICIT_OPERATOR_EVENTS.has(input.eventType)
  };
}

function requireOperator(req: any, res: any, next: any) {
  if (!operatorTokenConfigured()) return res.status(503).json({ ok: false, error: 'HIPICO_OPERATOR_TOKEN_NOT_CONFIGURED' });
  if (!operatorTokenValid(req.header('x-hipico-operator-token') || undefined)) {
    return res.status(401).json({ ok: false, error: 'HIPICO_OPERATOR_UNAUTHORIZED' });
  }
  return next();
}

const router = Router();
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  next();
});
router.use(requireOperator);

router.get('/status', (_req, res) => {
  const ownerReady = Boolean(configuredCanonicalOwnerId());
  return res.status(ownerReady ? 200 : 503).json({
    ok: ownerReady,
    api: 'hipico-canonical',
    version: HIPICO_CANONICAL_API_VERSION,
    mode: 'operator-confirmed-domain',
    ownerConfigured: ownerReady,
    sourceWrite: false,
    monetaryWrite: false,
    resources: ['preview', 'domain/events', 'domain/:aggregateKind/:aggregateKey'],
    adapters: { legacyIntegrationPrefix: '/api/v1/hipico-bot' }
  });
});

router.post('/preview', (req, res) => {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'HIPICO_CANONICAL_PREVIEW_INVALID' });
  const input = parsed.data;
  const effectiveMediaKind = effectiveBridgeMediaKind(input.hasMedia, input.mediaKind);
  const { assessment, result } = classifyUntrustedConversation({
    text: input.text,
    mediaKind: effectiveMediaKind,
    quoteDepth: input.quoteDepth,
    participantId: input.participantId
  });
  return res.json({
    ok: true,
    groupKey: input.groupKey,
    classification: result,
    appsec: safePublicAbuseMetadata(assessment),
    effectiveMediaKind,
    raceContextKey: operationalRaceContextKey(result.entities),
    effectsAllowed: false,
    sourceWrite: false,
    monetaryWrite: false
  });
});

router.get('/domain/:aggregateKind/:aggregateKey', async (req, res) => {
  const kind = aggregateKindSchema.safeParse(req.params.aggregateKind);
  const aggregateKey = z.string().trim().min(1).max(180).safeParse(req.params.aggregateKey);
  const query = domainReadSchema.safeParse(req.query);
  if (!kind.success || !aggregateKey.success || !query.success) {
    return res.status(400).json({ ok: false, error: 'HIPICO_CANONICAL_READ_INVALID' });
  }
  const ownerId = configuredCanonicalOwnerId();
  if (!ownerId) return res.status(503).json({ ok: false, error: 'HIPICO_OWNER_NOT_CONFIGURED' });
  try {
    const data = await readHipicoDomainAggregate({
      ownerId,
      groupKey: query.data.groupKey,
      aggregateKind: kind.data,
      aggregateKey: aggregateKey.data,
      limit: query.data.limit
    });
    if (!data) return res.status(404).json({ ok: false, error: 'HIPICO_DOMAIN_AGGREGATE_NOT_FOUND' });
    return res.json({ ok: true, data, sourceWrite: false, monetaryWrite: false });
  } catch (error: any) {
    console.error('[hipico-canonical] domain read failed', {
      error: error?.message || String(error),
      aggregateKind: kind.data
    });
    return res.status(503).json({ ok: false, retryable: true, error: 'HIPICO_CANONICAL_READ_UNAVAILABLE' });
  }
});

router.post('/domain/events', async (req, res) => {
  const parsed = domainEventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'HIPICO_CANONICAL_EVENT_INVALID' });
  const ownerId = configuredCanonicalOwnerId();
  if (!ownerId) return res.status(503).json({ ok: false, error: 'HIPICO_OWNER_NOT_CONFIGURED' });
  const input = parsed.data;
  const scopeIssue = canonicalScopeIssue(input);
  if (scopeIssue) {
    const expectedAggregateKey = scopeIssue === 'HIPICO_RACE_AGGREGATE_KEY_MISMATCH' ? canonicalRaceContextKey(input) : null;
    return res.status(400).json({
      ok: false,
      retryable: false,
      error: scopeIssue,
      ...(expectedAggregateKey ? { expectedAggregateKey } : {})
    });
  }
  const policy = canonicalMutationPolicy(input);

  if (!input.confirmedOperatorAction && String(input.confirmationReason || '').trim()) {
    return res.status(400).json({ ok: false, error: 'HIPICO_CONFIRMATION_FLAG_REQUIRED' });
  }
  if (input.confirmedOperatorAction && String(input.confirmationReason || '').trim().length < 5) {
    return res.status(400).json({ ok: false, error: 'HIPICO_CONFIRMATION_REASON_REQUIRED' });
  }

  try {
    const persisted = await persistHipicoDomainEvent({
      ownerId,
      groupKey: input.groupKey,
      aggregateKind: input.aggregateKind,
      aggregateKey: input.aggregateKey,
      event: {
        type: input.eventType,
        sourceMessageKey: input.sourceMessageKey,
        sourceMessageId: input.sourceMessageId || null,
        rawMessage: input.rawMessage || null,
        normalizedPayload: input.normalizedPayload,
        actorRef: input.operatorId,
        source: 'canonical_operator_api',
        parserVersion: input.parserVersion || null,
        schemaVersion: 1,
        timestamp: input.timestamp,
        originalEventId: input.originalEventId || null,
        requiresReview: policy.requiresReview,
        operatorConfirmed: input.confirmedOperatorAction,
        confirmationReason: input.confirmationReason || null
      }
    });

    return res.status(persisted.duplicate ? 200 : 202).json({
      ok: true,
      data: persisted,
      policy,
      quarantined: policy.requiresReview,
      groupKey: input.groupKey,
      sourceWrite: false,
      monetaryWrite: false
    });
  } catch (error: any) {
    if (error?.code === 'HIPICO_DOMAIN_REPLAY_MISMATCH') {
      return res.status(409).json({ ok: false, retryable: false, error: 'HIPICO_DOMAIN_REPLAY_MISMATCH' });
    }
    if (['HIPICO_DOMAIN_STATE_CONFLICT', 'HIPICO_EVENT_ALREADY_REVERSED'].includes(String(error?.message || ''))) {
      return res.status(409).json({ ok: false, retryable: true, error: String(error.message) });
    }
    console.error('[hipico-canonical] domain event failed', {
      error: error?.message || String(error),
      groupKey: input.groupKey,
      aggregateKind: input.aggregateKind,
      eventType: input.eventType
    });
    return res.status(503).json({ ok: false, retryable: true, error: 'HIPICO_CANONICAL_PERSISTENCE_UNAVAILABLE' });
  }
});

export default router;

export const __test__ = {
  STATE_ADVANCING_EVENTS,
  EXPLICIT_OPERATOR_EVENTS,
  RACE_ONLY_EVENTS,
  DAY_ONLY_EVENTS,
  RACE_CONTEXT_ANCHOR_EVENTS,
  previewSchema,
  domainReadSchema,
  domainEventSchema
};
