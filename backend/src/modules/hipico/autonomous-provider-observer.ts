import crypto from 'node:crypto';
import { AutomationStore } from './automation.store.js';
import { createDefaultHipicoAgentEngine } from './agent-engine.js';
import { createHipicoDecisionProvider, type JevShadowDecision } from './jev-decision-provider.js';
import {
  decisionProviderReadiness,
  type DecisionProviderReadiness
} from './decision-provider-metrics.js';
import type { DecisionProviderObservation } from './decision-provider.js';

export type AutonomousProviderEvidence = {
  observation: DecisionProviderObservation<JevShadowDecision> | null;
  readiness: DecisionProviderReadiness | null;
  evaluationId: string | null;
  failureCode: string | null;
};

type Dependencies = {
  store: Pick<AutomationStore, 'recordEvaluation' | 'decisionProviderMetrics'>;
  engine: ReturnType<typeof createDefaultHipicoAgentEngine>;
  provider: ReturnType<typeof createHipicoDecisionProvider>;
};

const defaults: Dependencies = {
  store: new AutomationStore(),
  engine: createDefaultHipicoAgentEngine(),
  provider: createHipicoDecisionProvider()
};

function sourceEvidenceRef(value: string) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export async function observeAutonomousProvider(input: {
  ownerId: string | null;
  groupKey: string;
  groupId: string;
  text: string;
  sourceMessageId: string;
  humanOwned: boolean;
  systemHealthy: boolean;
}, deps: Dependencies = defaults): Promise<AutonomousProviderEvidence> {
  if (!input.ownerId) {
    return { observation: null, readiness: null, evaluationId: null, failureCode: 'OWNER_NOT_CONFIGURED' };
  }

  try {
    const evaluation = await deps.engine.evaluate(input.text, 'SHADOW', {
      sourceReadOnly: true,
      evidenceState: 'MISSING',
      sourceAuthorized: false,
      systemHealthy: input.systemHealthy,
      humanOwned: input.humanOwned,
      ambiguous: false,
      toolValidated: false
    });

    const observation = await deps.provider.observe({
      text: input.text,
      candidate: evaluation.candidate
    });

    const receipt = await deps.store.recordEvaluation({
      ownerId: input.ownerId,
      groupKey: input.groupKey,
      groupId: input.groupId,
      text: input.text,
      candidate: evaluation.candidate,
      canAct: false,
      riskPolicy: evaluation.riskPolicy,
      evidence: {
        channel: 'whatsapp_group_bridge',
        sourceMessageRef: sourceEvidenceRef(input.sourceMessageId),
        decisionProvider: observation
      }
    });

    const metrics = await deps.store.decisionProviderMetrics(
      input.ownerId,
      input.groupKey,
      input.groupId
    );

    return {
      observation,
      readiness: decisionProviderReadiness(deps.provider.publicStatus(), metrics),
      evaluationId: String(receipt.id || '') || null,
      failureCode: null
    };
  } catch (error: any) {
    return {
      observation: null,
      readiness: null,
      evaluationId: null,
      failureCode: String(error?.code || error?.message || 'AUTONOMOUS_PROVIDER_EVIDENCE_UNAVAILABLE').slice(0, 120)
    };
  }
}

export const __test__ = { sourceEvidenceRef };
