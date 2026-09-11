import { Router } from 'express';
import { z } from 'zod';
import { classifyUntrustedConversation, safePublicAbuseMetadata } from './hipico-conversation-appsec.js';
import { effectiveBridgeMediaKind } from './hipico-bridge-input-policy.js';
import { persistHipicoDomainEvent } from './hipico-domain-event.store.js';
import { operatorTokenConfigured, operatorTokenValid } from './hipico-operator-security.js';
import type { HipicoDomainEventType } from './hipico-domain-state.js';

export const HIPICO_CANONICAL_API_VERSION = 'v1';

const STATE_ADVANCING_EVENTS = new Set<HipicoDomainEventType>([
  'PLAN_RECORDED', 'RACE_OPENED', 'RACE_CLOSED', 'RESULT_RECORDED', 'SETTLEMENT_READY',
  'SETTLEMENT_RECORDED', 'BALANCE_CONFIRMED', 'RACE_PUBLISHED', 'RACE_ARCHIVED',
  'DAY_OPENED', 'DAY_CLOSING', 'DAY_CLOSED', 'DAY_ARCHIVED'
]);
const EXPLICIT_OPERATOR_EVENTS = new Set<HipicoDomainEventType>(['CORRECTION', 'REVERSAL']);

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

const domainEventSchema = z.object({
  groupKey: z.string().trim().min(1).max(120),
  aggregateKind: z.enum(['race', 'day']),
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

export function canonicalMutationPolicy(input: Pick<DomainEventBody, 'eventType' | 'confirmedOperatorAction' | 'confirmationReason'>) {
  const requiresReview = canonicalRequiresReview(input);
  return {
    requiresReview,
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
    effectsAllowed: false,
    sourceWrite: false,
    monetaryWrite: false
  });
});

router.post('/domain/events', async (req, res) => {
  const parsed = domainEventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'HIPICO_CANONICAL_EVENT_INVALID' });
  const ownerId = configuredCanonicalOwnerId();
  if (!ownerId) return res.status(503).json({ ok: false, error: 'HIPICO_OWNER_NOT_CONFIGURED' });
  const input = parsed.data;
  const policy = canonicalMutationPolicy(input);

  if ((EXPLICIT_OPERATOR_EVENTS.has(input.eventType) || STATE_ADVANCING_EVENTS.has(input.eventType))
    && !input.confirmedOperatorAction
    && String(input.confirmationReason || '').trim()) {
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
        requiresReview: policy.requiresReview
      }
    });

    return res.status(persisted.duplicate ? 200 : 202).json({
      ok: true,
      data: persisted,
      policy,
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
  previewSchema,
  domainEventSchema
};
