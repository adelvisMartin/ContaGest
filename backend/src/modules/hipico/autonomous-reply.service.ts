import { createDefaultHipicoAgentEngine } from './agent-engine.js';
import { safeToolRequest } from './agent-tools.js';
import { AutomationStore } from './automation.store.js';
import {
  canonicalIntentToJevClass,
  decisionProviderReadiness,
  type DecisionProviderReadiness
} from './decision-provider-metrics.js';
import type { DecisionProviderObservation } from './decision-provider.js';
import { createHipicoDecisionProvider, type JevShadowDecision } from './jev-decision-provider.js';
import { RaceQueryService, formatRaceQueryResponse } from './race-query.service.js';
import { decideRiskPolicy, type RiskPolicyDecision } from './risk-policy.js';
import type { SafeResponsePlan } from '../hipico-bot/hipico-response-safety.js';

type RuntimeEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const AUTONOMOUS_REPLY_POLICY_VERSION = 'hipico-autonomous-reply-v1';

export type AutonomousReplyAction = 'SEND' | 'HOLD' | 'NONE';

export type AutonomousReplyDecision = {
  version: typeof AUTONOMOUS_REPLY_POLICY_VERSION;
  action: AutonomousReplyAction;
  canSend: boolean;
  text: string | null;
  reason: string;
  responseIdempotencyKey: string;
  sourceMessageId: string;
  handoffRequired: boolean;
  candidateIntent: string | null;
  riskPolicy: RiskPolicyDecision | null;
  provider: {
    observation: DecisionProviderObservation<JevShadowDecision> | null;
    readiness: DecisionProviderReadiness | null;
    influence: 'NONE' | 'DOWNGRADE_ONLY';
  };
  authority: {
    deterministicOnly: true;
    domainEffectsAllowed: false;
    financialAuthority: false;
    stateMutationAllowed: false;
  };
};

export type AutonomousReplyInput = {
  ownerId: string;
  groupKey: string;
  groupId: string;
  text: string;
  sourceMessageId: string;
  fromMe: boolean;
  historySync: boolean;
  duplicate: boolean;
  mediaKind: string;
  rateAllowed: boolean;
  systemHealthy: boolean;
  responsePlan: SafeResponsePlan;
};

type AgentEngine = ReturnType<typeof createDefaultHipicoAgentEngine>;
type DecisionProvider = ReturnType<typeof createHipicoDecisionProvider>;

type AutonomousReplyDependencies = {
  engine?: AgentEngine;
  decisionProvider?: DecisionProvider;
  automationStore?: AutomationStore;
  raceQueryService?: RaceQueryService;
  env?: RuntimeEnv;
};

function enabledFlag(value: unknown) {
  return String(value || '').trim().toLowerCase() === 'true';
}

export function sourceAutoReplyEnabled(env: RuntimeEnv = process.env) {
  return enabledFlag(env.HIPICO_SOURCE_AUTO_REPLY_ENABLED);
}

function baseDecision(input: AutonomousReplyInput): Pick<
  AutonomousReplyDecision,
  'version' | 'responseIdempotencyKey' | 'sourceMessageId' | 'handoffRequired' | 'authority'
> {
  return {
    version: AUTONOMOUS_REPLY_POLICY_VERSION,
    responseIdempotencyKey: input.responsePlan.responseIdempotencyKey,
    sourceMessageId: input.sourceMessageId,
    handoffRequired: input.responsePlan.handoffRequired,
    authority: {
      deterministicOnly: true,
      domainEffectsAllowed: false,
      financialAuthority: false,
      stateMutationAllowed: false
    }
  };
}

function none(input: AutonomousReplyInput, reason: string): AutonomousReplyDecision {
  return {
    ...baseDecision(input),
    action: 'NONE',
    canSend: false,
    text: null,
    reason,
    candidateIntent: null,
    riskPolicy: null,
    provider: { observation: null, readiness: null, influence: 'NONE' }
  };
}

function hold(
  input: AutonomousReplyInput,
  reason: string,
  options: Partial<Pick<AutonomousReplyDecision, 'candidateIntent' | 'riskPolicy'>> & {
    observation?: DecisionProviderObservation<JevShadowDecision> | null;
    readiness?: DecisionProviderReadiness | null;
  } = {}
): AutonomousReplyDecision {
  return {
    ...baseDecision(input),
    action: 'HOLD',
    canSend: false,
    text: null,
    reason,
    candidateIntent: options.candidateIntent || null,
    riskPolicy: options.riskPolicy || null,
    provider: {
      observation: options.observation || null,
      readiness: options.readiness || null,
      influence: options.observation ? 'DOWNGRADE_ONLY' : 'NONE'
    }
  };
}

function send(
  input: AutonomousReplyInput,
  text: string,
  reason: string,
  options: Partial<Pick<AutonomousReplyDecision, 'candidateIntent' | 'riskPolicy'>> & {
    observation?: DecisionProviderObservation<JevShadowDecision> | null;
    readiness?: DecisionProviderReadiness | null;
  } = {}
): AutonomousReplyDecision {
  return {
    ...baseDecision(input),
    action: 'SEND',
    canSend: true,
    text: String(text || '').trim().slice(0, 3900),
    reason,
    candidateIntent: options.candidateIntent || null,
    riskPolicy: options.riskPolicy || null,
    provider: {
      observation: options.observation || null,
      readiness: options.readiness || null,
      influence: options.observation ? 'DOWNGRADE_ONLY' : 'NONE'
    }
  };
}

function providerDisagrees(
  candidateIntent: string,
  observation: DecisionProviderObservation<JevShadowDecision> | null,
  readiness: DecisionProviderReadiness | null
) {
  if (!readiness?.eligibleForAssistedRanking || observation?.status !== 'OBSERVED' || !observation.decision) {
    return false;
  }
  const expectedClass = canonicalIntentToJevClass(candidateIntent);
  return observation.decision.intentClass !== expectedClass
    || observation.decision.humanReviewProbability >= .5
    || observation.decision.candidateAgreementProbability < .5;
}

function safeConversationalIntent(intent: string) {
  return intent === 'greeting' || intent === 'help' || intent === 'status_non_monetary';
}

function safeQueryIntent(intent: string) {
  return intent.startsWith('query:');
}

export class AutonomousReplyService {
  private readonly engine: AgentEngine;
  private readonly decisionProvider: DecisionProvider;
  private readonly automationStore: AutomationStore;
  private readonly raceQueryService: RaceQueryService;
  private readonly env: RuntimeEnv;

  constructor(dependencies: AutonomousReplyDependencies = {}) {
    this.engine = dependencies.engine || createDefaultHipicoAgentEngine();
    this.decisionProvider = dependencies.decisionProvider || createHipicoDecisionProvider();
    this.automationStore = dependencies.automationStore || new AutomationStore();
    this.raceQueryService = dependencies.raceQueryService || new RaceQueryService();
    this.env = dependencies.env || process.env;
  }

  async decide(input: AutonomousReplyInput): Promise<AutonomousReplyDecision> {
    if (!sourceAutoReplyEnabled(this.env)) return none(input, 'SOURCE_AUTO_REPLY_DISABLED');
    if (input.historySync) return none(input, 'HISTORY_SYNC_NO_RESPONSE');
    if (input.fromMe) return none(input, 'SELF_MESSAGE_NO_RESPONSE');
    if (input.duplicate) return none(input, 'DUPLICATE_SOURCE_MESSAGE');
    if (!input.rateAllowed) return none(input, 'RATE_LIMIT');
    if (!input.systemHealthy) return hold(input, 'SYSTEM_NOT_AUTHORITATIVE');
    if (!input.responsePlan.canSend || !input.responsePlan.text) {
      return input.responsePlan.handoffRequired
        ? hold(input, input.responsePlan.reason)
        : none(input, input.responsePlan.reason);
    }

    const shadowEvaluation = await this.engine.evaluate(input.text, 'SHADOW', {
      evidenceState: 'MISSING',
      sourceAuthorized: false,
      sourceReadOnly: true,
      systemHealthy: input.systemHealthy,
      ambiguous: input.responsePlan.intent === 'NEEDS_CLARIFICATION'
    });
    const candidate = shadowEvaluation.candidate;
    const observation = await this.decisionProvider.observe({ text: input.text, candidate });

    let readiness: DecisionProviderReadiness | null = null;
    try {
      const metrics = await this.automationStore.decisionProviderMetrics(
        input.ownerId,
        input.groupKey,
        input.groupId
      );
      readiness = decisionProviderReadiness(this.decisionProvider.publicStatus(), metrics);
    } catch {
      readiness = null;
    }

    try {
      await this.automationStore.recordEvaluation({
        ownerId: input.ownerId,
        groupKey: input.groupKey,
        groupId: input.groupId,
        text: input.text,
        candidate,
        canAct: false,
        riskPolicy: shadowEvaluation.riskPolicy,
        evidence: {
          source: 'whatsapp-group-autonomous-reply',
          decisionProvider: observation,
          responsePlan: {
            intent: input.responsePlan.intent,
            reason: input.responsePlan.reason,
            handoffRequired: input.responsePlan.handoffRequired
          }
        }
      });
    } catch {
      return hold(input, 'AUTONOMOUS_REPLY_AUDIT_PERSISTENCE_FAILED', {
        candidateIntent: candidate.intent,
        observation,
        readiness
      });
    }

    if (!safeQueryIntent(candidate.intent) && !safeConversationalIntent(candidate.intent)) {
      return send(input, input.responsePlan.text, 'AUTONOMOUS_NON_CONFIRMING_RESPONSE', {
        candidateIntent: candidate.intent,
        riskPolicy: shadowEvaluation.riskPolicy,
        observation,
        readiness
      });
    }

    if (providerDisagrees(candidate.intent, observation, readiness)) {
      const clarification = 'Necesito una precisión adicional para responder con seguridad. Reformula la consulta indicando la carrera o el dato que deseas consultar.';
      return send(input, clarification, 'PROVIDER_DOWNGRADE_REQUIRES_CLARIFICATION', {
        candidateIntent: candidate.intent,
        riskPolicy: shadowEvaluation.riskPolicy,
        observation,
        readiness
      });
    }

    if (safeConversationalIntent(candidate.intent)) {
      return send(input, input.responsePlan.text, 'DETERMINISTIC_SAFE_CONVERSATION', {
        candidateIntent: candidate.intent,
        riskPolicy: shadowEvaluation.riskPolicy,
        observation,
        readiness
      });
    }

    let queryResult;
    try {
      queryResult = await this.raceQueryService.execute({
        ownerId: input.ownerId,
        groupKey: input.groupKey,
        text: input.text
      });
    } catch (error: any) {
      const code = String(error?.code || error?.message || 'RACE_QUERY_UNAVAILABLE');
      if (code === 'RACE_QUERY_AMBIGUOUS' || code === 'RACE_QUERY_CONTEXT_REQUIRED') {
        return send(
          input,
          'Necesito que indiques la carrera o reunión exacta para responder sin adivinar.',
          code,
          { candidateIntent: candidate.intent, observation, readiness }
        );
      }
      return hold(input, code, { candidateIntent: candidate.intent, observation, readiness });
    }

    const toolRequest = safeToolRequest(candidate);
    const autoPolicy = decideRiskPolicy({
      mode: 'AUTOMATIC_LOW_RISK',
      candidate,
      evidenceState: 'FRESH',
      sourceAuthorized: true,
      sourceReadOnly: false,
      systemHealthy: true,
      ambiguous: false,
      toolValidated: Boolean(toolRequest)
    });
    if (autoPolicy.disposition !== 'AUTO' || !autoPolicy.autonomousSendAllowed) {
      return hold(input, autoPolicy.reason, {
        candidateIntent: candidate.intent,
        riskPolicy: autoPolicy,
        observation,
        readiness
      });
    }

    return send(input, formatRaceQueryResponse(queryResult), 'CANONICAL_READ_ONLY_QUERY', {
      candidateIntent: candidate.intent,
      riskPolicy: autoPolicy,
      observation,
      readiness
    });
  }
}

export const __test__ = {
  enabledFlag,
  providerDisagrees,
  safeConversationalIntent,
  safeQueryIntent
};
