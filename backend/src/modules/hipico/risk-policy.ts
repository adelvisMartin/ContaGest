import type { AgentCandidate, AutomationState, AgentTool } from './agent-policy.js';

export const RISK_POLICY_VERSION = 'hipico-risk-policy-v1';
export const RISK_DISPOSITIONS = ['AUTO', 'SUGGEST', 'HUMAN_REQUIRED', 'DENY'] as const;
export type RiskDisposition = typeof RISK_DISPOSITIONS[number];
export type EvidenceState = 'NOT_REQUIRED' | 'MISSING' | 'FRESH' | 'STALE' | 'CONFLICT';

export type RiskPolicyInput = {
  mode: AutomationState;
  candidate: AgentCandidate;
  evidenceState?: EvidenceState;
  sourceAuthorized?: boolean;
  systemHealthy?: boolean;
  sourceReadOnly?: boolean;
  humanOwned?: boolean;
  ambiguous?: boolean;
  toolValidated?: boolean;
};

export type RiskPolicyDecision = {
  version: typeof RISK_POLICY_VERSION;
  disposition: RiskDisposition;
  reason: string;
  autonomousSendAllowed: boolean;
  requiresHuman: boolean;
  toolExecutable: boolean;
  evidenceState: EvidenceState;
  financialAuthority: false;
};

const AUTO_TOOLS = new Set<AgentTool>([
  'queryRaceStatus',
  'queryNextRace',
  'queryLastResult',
  'querySchedule',
  'queryScratches'
]);
const EVIDENCE_FREE_INTENTS = new Set(['greeting', 'help']);
const FINANCIAL_INTENTS = new Set([
  'betting_or_balance',
  'offer_player',
  'offer_receiver',
  'settlement_snapshot',
  'balance_snapshot',
  'pending_confirmation',
  'cancel_or_correction'
]);
const SECURITY_INTENTS = new Set(['security_review', 'prompt_injection', 'tool_injection']);
const LIFECYCLE_INTENTS = new Set(['race_open', 'race_close', 'race_result', 'result', 'day_close']);
const MIN_AUTO_CONFIDENCE = .95;

function decision(
  disposition: RiskDisposition,
  reason: string,
  evidenceState: EvidenceState,
  toolExecutable = false
): RiskPolicyDecision {
  return {
    version: RISK_POLICY_VERSION,
    disposition,
    reason,
    autonomousSendAllowed: disposition === 'AUTO',
    requiresHuman: disposition === 'HUMAN_REQUIRED',
    toolExecutable: disposition === 'AUTO' && toolExecutable,
    evidenceState,
    financialAuthority: false
  };
}

function evidenceRequired(candidate: AgentCandidate) {
  if (EVIDENCE_FREE_INTENTS.has(candidate.intent)) return false;
  return Boolean(candidate.tool && AUTO_TOOLS.has(candidate.tool));
}

export function decideRiskPolicy(input: RiskPolicyInput): RiskPolicyDecision {
  const candidate = input.candidate;
  const evidenceState: EvidenceState = input.evidenceState || (evidenceRequired(candidate) ? 'MISSING' : 'NOT_REQUIRED');
  const toolEligible = Boolean(candidate.tool && AUTO_TOOLS.has(candidate.tool));
  const toolValidated = input.toolValidated === true;

  if (input.sourceReadOnly) return decision('DENY', 'SOURCE_READ_ONLY', evidenceState);
  if (input.mode === 'DISABLED') return decision('DENY', 'AUTOMATION_DISABLED', evidenceState);
  if (SECURITY_INTENTS.has(candidate.intent)) return decision('DENY', 'SECURITY_POLICY_VIOLATION', evidenceState);
  if (candidate.risk === 'monetary' || FINANCIAL_INTENTS.has(candidate.intent)) {
    return decision('DENY', 'FINANCIAL_AUTHORITY_DENIED', evidenceState);
  }

  if (input.humanOwned) return decision('HUMAN_REQUIRED', 'HUMAN_OWNS_CONVERSATION', evidenceState);
  if (input.systemHealthy === false) return decision('HUMAN_REQUIRED', 'SYSTEM_NOT_AUTHORITATIVE', evidenceState);
  if (input.ambiguous) return decision('HUMAN_REQUIRED', 'AMBIGUOUS_CONTEXT', evidenceState);
  if (candidate.risk === 'review' || candidate.tool === 'proposeRaceCommand' || LIFECYCLE_INTENTS.has(candidate.intent)) {
    return decision('HUMAN_REQUIRED', 'OPERATIONAL_REVIEW_REQUIRED', evidenceState);
  }
  if (candidate.risk !== 'safe') return decision('HUMAN_REQUIRED', 'CLASSIFIER_REVIEW_REQUIRED', evidenceState);
  if (!Number.isFinite(candidate.confidence) || candidate.confidence < MIN_AUTO_CONFIDENCE) {
    return decision('HUMAN_REQUIRED', 'LOW_CONFIDENCE', evidenceState);
  }
  if (!toolEligible || !toolValidated) return decision('HUMAN_REQUIRED', 'TOOL_NOT_AUTO_EXECUTABLE', evidenceState);

  if (evidenceRequired(candidate)) {
    if (evidenceState === 'CONFLICT') return decision('HUMAN_REQUIRED', 'EVIDENCE_CONFLICT', evidenceState);
    if (evidenceState === 'STALE') return decision('HUMAN_REQUIRED', 'EVIDENCE_STALE', evidenceState);
    if (evidenceState !== 'FRESH') return decision('HUMAN_REQUIRED', 'EVIDENCE_MISSING', evidenceState);
    if (input.sourceAuthorized !== true) return decision('HUMAN_REQUIRED', 'EVIDENCE_SOURCE_NOT_AUTHORIZED', evidenceState);
  }

  if (input.mode === 'SHADOW' || input.mode === 'ASSISTED') {
    return decision('SUGGEST', input.mode === 'SHADOW' ? 'SHADOW_NO_AUTONOMOUS_SEND' : 'ASSISTED_REQUIRES_APPROVAL', evidenceState);
  }

  if (input.mode === 'AUTOMATIC_LOW_RISK' || input.mode === 'AUTOMATIC') {
    return decision('AUTO', 'LOW_RISK_AUTOMATION_ALLOWED', evidenceState, true);
  }

  return decision('DENY', 'AUTOMATION_MODE_INVALID', evidenceState);
}

export const __test__ = { evidenceRequired, MIN_AUTO_CONFIDENCE, AUTO_TOOLS, FINANCIAL_INTENTS };
