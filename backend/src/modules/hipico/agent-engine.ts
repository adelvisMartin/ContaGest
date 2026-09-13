import { classify } from '../hipico-bot/hipico-operational-classifier.js';
import { classifyRaceQueryIntent } from './race-lifecycle.js';
import { HipicoAgentEngine, type DeterministicAgentParser } from './agent-policy.js';

const TOOL_NAME = '(?:queryRaceStatus|queryNextRace|queryLastResult|querySchedule|queryScratches|proposeRaceCommand)';
const PROMPT_INJECTION = new RegExp([
  'ignora\\s+(?:todas?\\s+)?(?:tus?\\s+)?(?:reglas|instrucciones|politicas)',
  'system\\s*:',
  'drop\\s+table',
  '(?:ejecuta|execute|usa|use)\\s+(?:sql|shell|cmd|powershell)',
  `(?:llama|call|invoke|usa|use)\\s+${TOOL_NAME}`,
  '\\b(?:authorization|bearer)\\b',
  'HIPICO_[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY)'
].join('|'), 'i');
const DOCUMENT_REFERENCE = /\b(?:documento|archivo|pdf)\b[\s\S]{0,120}\b(?:adjunto|adjunta|sin\s+texto|sin\s+contenido)\b/i;
const AMBIGUOUS_LIFECYCLE = /\b(?:ya\s+)?est[aá]\s+(?:abierta|cerrada|corriendo|suspendida)\b/i;
const EXPLICIT_RACE_CONTEXT = /\b(?:carrera|race)\b|\b\d{1,3}\s*(?:ra|da|ta|ma)?\b/i;

export function looksLikeAgentPolicyInjection(text: string) {
  return PROMPT_INJECTION.test(String(text || '').slice(0, 4000));
}

function looksLikeAttachmentOnlyReference(text: string) {
  return DOCUMENT_REFERENCE.test(String(text || '').slice(0, 4000));
}

function looksLikeAmbiguousLifecycle(text: string) {
  const value = String(text || '').slice(0, 4000);
  return AMBIGUOUS_LIFECYCLE.test(value) && !EXPLICIT_RACE_CONTEXT.test(value);
}

const parser: DeterministicAgentParser = {
  parse(text: string) {
    if (looksLikeAgentPolicyInjection(text)) {
      return {
        intent: 'security_review',
        confidence: .999,
        tool: null,
        arguments: {},
        risk: 'review'
      };
    }

    if (looksLikeAttachmentOnlyReference(text)) {
      return {
        intent: 'document_reference',
        confidence: .999,
        tool: null,
        arguments: {},
        risk: 'review'
      };
    }

    if (looksLikeAmbiguousLifecycle(text)) {
      return {
        intent: 'unknown',
        confidence: .999,
        tool: null,
        arguments: {},
        risk: 'review'
      };
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
