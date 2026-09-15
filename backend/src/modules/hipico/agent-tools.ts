import {
  AGENT_TOOLS,
  type AgentCandidate,
  type AgentTool,
  type AutomationState
} from './agent-contracts.js';

function boundedString(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function isAgentTool(value: unknown): value is AgentTool {
  return (AGENT_TOOLS as readonly unknown[]).includes(value);
}

export function validateModelCandidate(value: unknown): AgentCandidate {
  const row = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const intent = boundedString(row.intent, 120);
  const confidence = Number(row.confidence);
  const tool = row.tool == null ? null : row.tool;
  if (!intent || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 || (tool !== null && !isAgentTool(tool))) {
    throw new Error('AGENT_CANDIDATE_SCHEMA_INVALID');
  }
  const risk = row.risk;
  if (risk !== 'safe' && risk !== 'review' && risk !== 'monetary') throw new Error('AGENT_CANDIDATE_SCHEMA_INVALID');
  const args = row.arguments && typeof row.arguments === 'object' && !Array.isArray(row.arguments)
    ? row.arguments as Record<string, unknown>
    : {};
  return {
    intent,
    confidence,
    tool,
    arguments: args,
    risk,
    source: 'model',
    modelVersion: boundedString(row.modelVersion, 120) || null
  };
}

export const AUTO_EXECUTABLE_TOOLS = ['queryRaceStatus', 'queryNextRace', 'queryLastResult', 'querySchedule', 'queryScratches'] as const;
export const MIN_AUTO_CONFIDENCE = .95;
const AUTO_EXECUTABLE_TOOL_SET = new Set<AgentTool>(AUTO_EXECUTABLE_TOOLS);

export function agentCanAct(mode: AutomationState, candidate: AgentCandidate) {
  if (mode === 'DISABLED' || mode === 'SHADOW' || mode === 'ASSISTED') return false;
  if (candidate.risk !== 'safe') return false;
  if (!candidate.tool || !AUTO_EXECUTABLE_TOOL_SET.has(candidate.tool)) return false;
  if (!Number.isFinite(candidate.confidence) || candidate.confidence < MIN_AUTO_CONFIDENCE) return false;
  return mode === 'AUTOMATIC_LOW_RISK' || mode === 'AUTOMATIC';
}

const DANGEROUS_KEY = /(?:^|[_-])(sql|shell|command|child[_-]?process|exec|spawn|password|token|secret|credential|cookie|authorization|prototype|constructor|__proto__)(?:$|[_-])/i;
const QUERY_TOOLS = new Set<AgentTool>(AUTO_EXECUTABLE_TOOLS);
const PROPOSABLE_INTENTS = new Set(['race_open', 'race_close', 'race_result', 'result', 'day_close']);
const ALLOWED_KEYS: Record<AgentTool, ReadonlySet<string>> = {
  queryRaceStatus: new Set(['text', 'raceId']),
  queryNextRace: new Set(['text']),
  queryLastResult: new Set(['text']),
  querySchedule: new Set(['text', 'date']),
  queryScratches: new Set(['text', 'raceId']),
  proposeRaceCommand: new Set(['intent', 'entities'])
};

function rejected(): never {
  throw new Error('AGENT_TOOL_ARGUMENTS_REJECTED');
}

function boundedPlainRecord(value: unknown, maxKeys: number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) rejected();
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row);
  if (keys.length > maxKeys || keys.some((key) => DANGEROUS_KEY.test(key))) rejected();
  return row;
}

function safeScalar(value: unknown) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000) rejected();
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 500) rejected();
    return value;
  }
  rejected();
}

function sanitizeEntities(value: unknown) {
  const row = boundedPlainRecord(value, 24);
  return Object.fromEntries(Object.entries(row).map(([key, item]) => [key, safeScalar(item)]));
}

function sanitizeToolArguments(tool: AgentTool, raw: unknown, risk: AgentCandidate['risk']) {
  const row = boundedPlainRecord(raw ?? {}, 8);
  const allowed = ALLOWED_KEYS[tool];
  if (Object.keys(row).some((key) => !allowed.has(key))) rejected();

  if (QUERY_TOOLS.has(tool)) {
    if (risk !== 'safe') rejected();
    const result: Record<string, unknown> = {};
    if (row.text !== undefined) {
      if (typeof row.text !== 'string' || row.text.length > 1000) rejected();
      result.text = row.text;
    }
    if (row.raceId !== undefined) {
      if (typeof row.raceId !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(row.raceId)) rejected();
      result.raceId = row.raceId;
    }
    if (row.date !== undefined) {
      if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) rejected();
      result.date = row.date;
    }
    return result;
  }

  if (tool === 'proposeRaceCommand') {
    if (risk !== 'review') rejected();
    const intent = String(row.intent || '').trim();
    if (!PROPOSABLE_INTENTS.has(intent)) rejected();
    return { intent, entities: sanitizeEntities(row.entities ?? {}) };
  }

  rejected();
}

export function safeToolRequest(candidate: AgentCandidate) {
  if (!candidate.tool) return null;
  if (!isAgentTool(candidate.tool)) rejected();
  const argumentsValue = sanitizeToolArguments(candidate.tool, candidate.arguments, candidate.risk);
  const encoded = JSON.stringify(argumentsValue);
  if (encoded.length > 4000 || DANGEROUS_KEY.test(encoded)) rejected();
  return { tool: candidate.tool, arguments: argumentsValue };
}

export const __test__ = {
  boundedString,
  isAgentTool,
  DANGEROUS_KEY,
  QUERY_TOOLS,
  PROPOSABLE_INTENTS,
  ALLOWED_KEYS,
  sanitizeEntities,
  sanitizeToolArguments
};
