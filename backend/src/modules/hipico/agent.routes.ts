import { Router } from 'express';
import { createDefaultHipicoAgentEngine } from './agent-engine.js';
import { AutomationStore } from './automation.store.js';
import { hipicoError } from './hipico-domain.js';
import { createHipicoDecisionProvider } from './jev-decision-provider.js';
import { decisionProviderReadiness } from './decision-provider-metrics.js';
import {
  actorRef,
  automaticOwnerApprovalConfigured,
  evaluateSchema,
  groupKey,
  idempotencyKey,
  modeSchema,
  ownerId,
  parsedGroupId,
  requestId,
  reviewSchema,
  sendAutomationError,
  serverRiskContext,
  sourceReadOnly,
  uuidSchema
} from './agent-http.js';
import {
  operatorTokenConfigured,
  operatorTokenValid
} from '../hipico-bot/hipico-operator-security.js';
import { buildObservationTrace, candidateSha } from '../hipico-bot/hipico-observability.js';
import { recordHipicoObservationSafe } from '../hipico-bot/hipico-observability.store.js';

const router = Router();
const store = new AutomationStore();
const engine = createDefaultHipicoAgentEngine();
const decisionProvider = createHipicoDecisionProvider();

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!operatorTokenConfigured()) {
    return res.status(503).json(hipicoError({
      code: 'HIPICO_OPERATOR_TOKEN_NOT_CONFIGURED',
      message: 'Control de operador no configurado.',
      requestId: requestId(req),
      retryable: true
    }));
  }
  if (!operatorTokenValid(req.header('x-hipico-operator-token') || undefined)) {
    return res.status(401).json(hipicoError({
      code: 'HIPICO_OPERATOR_UNAUTHORIZED',
      message: 'Operador no autenticado.',
      requestId: requestId(req)
    }));
  }
  return next();
});

router.get('/groups/:groupId/automation', async (req, res) => {
  try {
    const owner = ownerId();
    const g = groupKey(req);
    const gid = parsedGroupId(req);
    const [config, metrics, providerMetrics] = await Promise.all([
      store.read(owner, g, gid),
      store.metrics(owner, g, gid),
      store.decisionProviderMetrics(owner, g, gid)
    ]);
    const providerStatus = decisionProvider.publicStatus();
    const providerReadiness = decisionProviderReadiness(providerStatus, providerMetrics);
    return res.json({
      ok: true,
      data: {
        ...config,
        metrics,
        agent: {
          generatorConfigured: false,
          deterministicFirst: true,
          decisionProvider: {
            ...providerStatus,
            metrics: providerMetrics,
            readiness: providerReadiness
          },
          financialAuthority: false,
          directEffectsAllowed: false
        }
      }
    });
  } catch (error) {
    return sendAutomationError(req, res, error);
  }
});

router.post('/groups/:groupId/automation', async (req, res) => {
  try {
    const body = modeSchema.parse(req.body);
    const data = await store.setMode({
      ownerId: ownerId(),
      groupKey: groupKey(req),
      groupId: parsedGroupId(req),
      target: body.target,
      actorRef: actorRef(),
      ownerApproved: automaticOwnerApprovalConfigured(),
      idempotencyKey: idempotencyKey(req)
    });
    if (!data.decision.allowed) {
      throw Object.assign(new Error(data.decision.reason), { code: data.decision.reason });
    }
    return res.json({ ok: true, data });
  } catch (error) {
    return sendAutomationError(req, res, error);
  }
});

router.get('/groups/:groupId/automation/transitions', async (req, res) => {
  try {
    const data = await store.transitionEvents(
      ownerId(),
      groupKey(req),
      parsedGroupId(req),
      Number(req.query.limit) || 100
    );
    return res.json({ ok: true, data });
  } catch (error) {
    return sendAutomationError(req, res, error);
  }
});

router.get('/groups/:groupId/automation/provider-metrics', async (req, res) => {
  try {
    const owner = ownerId();
    const g = groupKey(req);
    const gid = parsedGroupId(req);
    const status = decisionProvider.publicStatus();
    const metrics = await store.decisionProviderMetrics(owner, g, gid);
    return res.json({
      ok: true,
      data: {
        status,
        metrics,
        readiness: decisionProviderReadiness(status, metrics),
        authority: {
          authoritative: false,
          canAuthorize: false,
          financialAuthority: false,
          directEffectsAllowed: false
        }
      }
    });
  } catch (error) {
    return sendAutomationError(req, res, error);
  }
});

router.get('/groups/:groupId/automation/evaluations', async (req, res) => {
  try {
    const data = await store.evaluations(
      ownerId(),
      groupKey(req),
      parsedGroupId(req),
      Number(req.query.limit) || 100
    );
    return res.json({ ok: true, data });
  } catch (error) {
    return sendAutomationError(req, res, error);
  }
});

router.post('/groups/:groupId/automation/evaluate', async (req, res) => {
  const started = Date.now();
  try {
    const body = evaluateSchema.parse(req.body);
    const owner = ownerId();
    const g = groupKey(req);
    const gid = parsedGroupId(req);
    const rid = requestId(req);
    const trace = buildObservationTrace({ ownerId: owner, groupKey: g, groupId: gid, sourceRef: rid, requestId: rid });
    const config = await store.get(owner, g, gid);
    // Request evidence remains audit-only. Server-derived context alone can affect policy authority.
    const evaluation = await engine.evaluate(body.text, config.mode, serverRiskContext(gid));
    // External decision providers are evidence-only in v13. They cannot replace the
    // deterministic candidate, policy, tool gate, canAct decision, or outbox authority.
    const decisionProviderObservation = await decisionProvider.observe({
      text: body.text,
      candidate: evaluation.candidate
    });
    const policy = evaluation.riskPolicy;
    const disposition = String(policy?.disposition || 'HUMAN_REQUIRED');
    await recordHipicoObservationSafe({
      ...trace,
      stage: 'RISK_POLICY',
      outcome: disposition === 'DENY' ? 'DENIED' : disposition === 'AUTO' ? 'SUCCESS' : 'HELD',
      reasonCode: String(policy?.reason || disposition),
      latencyMs: Date.now() - started,
      candidateSha: candidateSha(),
      metadata: {
        disposition,
        mode: config.mode,
        evidenceState: policy?.evidenceState || null,
        decisionProviderStatus: decisionProviderObservation.status
      }
    });
    const receipt = await store.recordEvaluation({
      ownerId: owner,
      groupKey: g,
      groupId: gid,
      text: body.text,
      expectedIntent: body.expectedIntent,
      candidate: evaluation.candidate,
      canAct: evaluation.canAct,
      riskPolicy: evaluation.riskPolicy,
      evidence: {
        ...(body.evidence || {}),
        decisionProvider: decisionProviderObservation
      }
    });
    await recordHipicoObservationSafe({
      ...trace,
      stage: 'AGENT_DECISION',
      outcome: evaluation.canAct ? 'SUCCESS' : 'HELD',
      reasonCode: String(policy?.reason || 'AGENT_DECISION_RECORDED'),
      latencyMs: Date.now() - started,
      candidateSha: candidateSha(),
      metadata: {
        canAct: Boolean(evaluation.canAct),
        intent: evaluation.candidate?.intent || null,
        disposition,
        decisionProviderStatus: decisionProviderObservation.status,
        decisionProviderFailure: decisionProviderObservation.failureCode
      }
    });
    await recordHipicoObservationSafe({
      ...trace,
      stage: 'PERSISTENCE',
      outcome: 'SUCCESS',
      reasonCode: 'AGENT_EVALUATION_PERSISTED',
      latencyMs: Date.now() - started,
      candidateSha: candidateSha(),
      metadata: { receiptRecorded: Boolean(receipt) }
    });
    return res.status(202).json({
      ok: true,
      data: {
        ...evaluation,
        riskPolicy: evaluation.riskPolicy,
        decisionProvider: decisionProviderObservation,
        receipt,
        actions: [],
        financialAuthority: false,
        directEffectsApplied: false
      }
    });
  } catch (error) {
    return sendAutomationError(req, res, error);
  }
});

router.post('/groups/:groupId/automation/evaluations/:id/review', async (req, res) => {
  try {
    const body = reviewSchema.parse(req.body);
    const data = await store.review({
      ownerId: ownerId(),
      groupKey: groupKey(req),
      groupId: parsedGroupId(req),
      id: uuidSchema.parse(req.params.id),
      actualIntent: body.actualIntent,
      actorRef: actorRef(),
      highRiskFalsePositive: body.highRiskFalsePositive,
      unauthorizedAction: body.unauthorizedAction,
      conflict: body.conflict,
      raceContextError: body.raceContextError
    });
    return res.json({ ok: true, data });
  } catch (error) {
    return sendAutomationError(req, res, error);
  }
});

export default router;
export const __test__ = { sourceReadOnly, serverRiskContext };
