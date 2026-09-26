import type {
  AgentRiskContext,
  AutomationMetrics,
  AutomationState,
  PromotionDecision
} from './agent-contracts.js';
import { HipicoAgentEngine } from './agent-evaluator.js';
import { canPromoteAutomation } from './promotion-policy.js';
import type { RiskPolicyDecision } from './risk-policy.js';

export const UNIFIED_AGENT_RUNTIME_VERSION = 'hipico-unified-agent-runtime-v1' as const;

export type AgentRuntimeScope = {
  ownerId: string;
  groupKey: string;
  groupId: string;
};

export type AgentRuntimeEvaluateInput = {
  text: string;
  mode: AutomationState;
  riskContext?: AgentRiskContext;
  scope?: AgentRuntimeScope;
  expectedIntent?: string | null;
  evidence?: unknown;
};

export type AgentRuntimeAuditEvent = {
  runtimeVersion: typeof UNIFIED_AGENT_RUNTIME_VERSION;
  mode: AutomationState;
  intent: string;
  confidence: number;
  risk: 'safe' | 'review' | 'monetary';
  source: 'deterministic' | 'model';
  tool: string | null;
  disposition: RiskPolicyDecision['disposition'];
  reason: string;
  executionAllowed: boolean;
  financialAuthority: false;
};

type EvaluationRecordInput = {
  ownerId: string;
  groupKey: string;
  groupId: string;
  text: string;
  expectedIntent?: string | null;
  candidate: Awaited<ReturnType<HipicoAgentEngine['evaluate']>>['candidate'];
  canAct: boolean;
  riskPolicy: RiskPolicyDecision;
  evidence?: unknown;
};

export type AgentEvaluationRecord = Record<string, unknown>;

export interface AgentEvaluationRecorder {
  recordEvaluation(input: EvaluationRecordInput): Promise<AgentEvaluationRecord>;
}

export type UnifiedAgentRuntimeOptions = {
  recorder?: AgentEvaluationRecorder;
  audit?: (event: AgentRuntimeAuditEvent) => void | Promise<void>;
};

function boundedScopeValue(value: string, max: number, code: string) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > max) throw new Error(code);
  return normalized;
}

function normalizeScope(scope: AgentRuntimeScope): AgentRuntimeScope {
  return {
    ownerId: boundedScopeValue(scope.ownerId, 80, 'HIPICO_AGENT_RUNTIME_OWNER_REQUIRED'),
    groupKey: boundedScopeValue(scope.groupKey, 120, 'HIPICO_AGENT_RUNTIME_GROUP_KEY_REQUIRED'),
    groupId: boundedScopeValue(scope.groupId, 220, 'HIPICO_AGENT_RUNTIME_GROUP_ID_REQUIRED')
  };
}

export class UnifiedAgentRuntime {
  constructor(
    private readonly engine: HipicoAgentEngine,
    private readonly options: UnifiedAgentRuntimeOptions = {}
  ) {}

  async evaluate(input: AgentRuntimeEvaluateInput) {
    const evaluation = await this.engine.evaluate(input.text, input.mode, input.riskContext || {});
    const executableToolRequest = evaluation.canAct ? evaluation.toolRequest : null;

    let auditRecord: AgentEvaluationRecord | null = null;
    if (input.scope && this.options.recorder) {
      const scope = normalizeScope(input.scope);
      auditRecord = await this.options.recorder.recordEvaluation({
        ...scope,
        text: input.text,
        expectedIntent: input.expectedIntent ?? null,
        candidate: evaluation.candidate,
        canAct: evaluation.canAct,
        riskPolicy: evaluation.riskPolicy,
        evidence: input.evidence
      });
    }

    if (this.options.audit) {
      await this.options.audit({
        runtimeVersion: UNIFIED_AGENT_RUNTIME_VERSION,
        mode: evaluation.mode,
        intent: evaluation.candidate.intent,
        confidence: evaluation.candidate.confidence,
        risk: evaluation.candidate.risk,
        source: evaluation.candidate.source,
        tool: evaluation.candidate.tool,
        disposition: evaluation.riskPolicy.disposition,
        reason: evaluation.riskPolicy.reason,
        executionAllowed: evaluation.canAct,
        financialAuthority: false
      });
    }

    return {
      runtimeVersion: UNIFIED_AGENT_RUNTIME_VERSION,
      candidate: evaluation.candidate,
      mode: evaluation.mode,
      riskPolicy: evaluation.riskPolicy,
      proposal: {
        toolRequest: evaluation.toolRequest
      },
      execution: {
        allowed: evaluation.canAct,
        toolRequest: executableToolRequest
      },
      audit: auditRecord
    };
  }

  canPromote(
    current: AutomationState,
    target: AutomationState,
    metrics: AutomationMetrics,
    ownerApproved = false
  ): PromotionDecision {
    return canPromoteAutomation(current, target, metrics, ownerApproved);
  }
}

export const __test__ = { normalizeScope, boundedScopeValue };
