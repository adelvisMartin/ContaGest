import { classify } from '../hipico-bot/hipico-operational-classifier.js';
import { classifyRaceQueryIntent } from './race-lifecycle.js';
import { HipicoAgentEngine, type DeterministicAgentParser } from './agent-policy.js';

const parser: DeterministicAgentParser = {
  parse(text: string) {
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

    const result = classify(text);
    if (result.intent === 'greeting' || result.intent === 'help' || result.intent === 'status_non_monetary') {
      return {
        intent: result.intent,
        confidence: result.confidence,
        tool: 'queryRaceStatus',
        arguments: { text },
        risk: 'safe'
      };
    }

    if (['race_open', 'race_close', 'race_result', 'result', 'day_close'].includes(result.intent)) {
      return {
        intent: result.intent,
        confidence: result.confidence,
        tool: 'proposeRaceCommand',
        arguments: { intent: result.intent, entities: result.entities || {} },
        risk: 'review'
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
};

export function createDefaultHipicoAgentEngine() {
  return new HipicoAgentEngine(parser, null);
}

export const deterministicAgentParser = parser;