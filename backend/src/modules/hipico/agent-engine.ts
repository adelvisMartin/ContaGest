import { classify, OPERATIONAL_INTENTS, type IntentResult } from '../hipico-bot/hipico-operational-classifier.js';
import { classifyRaceQueryIntent } from './race-lifecycle.js';
import { HipicoAgentEngine, type DeterministicAgentParser } from './agent-policy.js';

const REVIEW_LIFECYCLE_INTENTS = new Set(['race_open', 'race_close', 'race_result', 'result', 'day_close']);

function operationalCandidate(result: IntentResult, text: string) {
  if (REVIEW_LIFECYCLE_INTENTS.has(result.intent)) {
    return {
      intent: result.intent,
      confidence: result.confidence,
      tool: 'proposeRaceCommand' as const,
      arguments: { intent: result.intent, entities: result.entities || {} },
      risk: 'review' as const
    };
  }
  if (result.intent === 'greeting' || result.intent === 'help' || result.intent === 'status_non_monetary') {
    return {
      intent: result.intent,
      confidence: result.confidence,
      tool: 'queryRaceStatus' as const,
      arguments: { text },
      risk: 'safe' as const
    };
  }
  return {
    intent: result.intent,
    confidence: result.confidence,
    tool: null,
    arguments: {},
    risk: result.risk
  };
}

const parser: DeterministicAgentParser = {
  parse(text: string) {
    const operational = classify(text);
    if (OPERATIONAL_INTENTS.has(operational.intent)) {
      return operationalCandidate(operational, text);
    }

    const query = classifyRaceQueryIntent(text);
    if (query !== 'UNKNOWN') {
      const tool = query === 'NEXT_RACE'
        ? 'queryNextRace'
        : query === 'LAST_RESULT'
          ? 'queryLastResult'
          : query === 'SCHEDULE'
            ? 'querySchedule'
            : query === 'SCRATCHES'
              ? 'queryScratches'
              : 'queryRaceStatus';
      return {
        intent: `query:${query}`,
        confidence: .995,
        tool,
        arguments: { text },
        risk: 'safe'
      };
    }

    return operationalCandidate(operational, text);
  }
};

export function createDefaultHipicoAgentEngine() {
  return new HipicoAgentEngine(parser, null);
}

export const deterministicAgentParser = parser;
