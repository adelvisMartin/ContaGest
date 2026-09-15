import { decideRiskPolicy } from './risk-policy.js';
import {
  type AgentCandidate,
  type AgentRiskContext,
  type AutomationState,
  type DeterministicAgentParser,
  type StructuredCandidateGenerator
} from './agent-contracts.js';
import { agentCanAct, safeToolRequest, validateModelCandidate } from './agent-tools.js';

function boundedMessage(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

export class HipicoAgentEngine {
  constructor(
    private readonly parser: DeterministicAgentParser,
    private readonly generator: StructuredCandidateGenerator | null = null
  ) {}

  async evaluate(text: string, mode: AutomationState, riskContext: AgentRiskContext = {}) {
    const normalized = boundedMessage(text, 4000);
    if (!normalized) throw new Error('AGENT_MESSAGE_REQUIRED');

    const deterministicBase = this.parser.parse(normalized);
    const deterministic: AgentCandidate = {
      ...deterministicBase,
      source: 'deterministic',
      modelVersion: null
    };

    let candidate = deterministic;
    if (this.generator && deterministic.confidence < .8) {
      const generated = validateModelCandidate(await this.generator.generate({ text: normalized, deterministic }));
      candidate = { ...generated, modelVersion: generated.modelVersion || this.generator.id };
    }

    const toolRequest = safeToolRequest(candidate);
    const riskPolicy = decideRiskPolicy({
      ...riskContext,
      mode,
      candidate,
      toolValidated: riskContext.toolValidated ?? Boolean(toolRequest)
    });
    const canAct = agentCanAct(mode, candidate)
      && riskPolicy.disposition === 'AUTO'
      && riskPolicy.autonomousSendAllowed;

    return { candidate, toolRequest, canAct, mode, riskPolicy };
  }
}

export const __test__ = { boundedMessage };
