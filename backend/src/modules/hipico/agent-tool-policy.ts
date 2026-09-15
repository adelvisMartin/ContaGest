export const AGENT_TOOLS = [
  'queryRaceStatus',
  'queryNextRace',
  'queryLastResult',
  'querySchedule',
  'queryScratches',
  'proposeRaceCommand'
] as const;
export type InternalAgentTool = typeof AGENT_TOOLS[number];

export const AUTO_EXECUTABLE_TOOLS = [
  'queryRaceStatus',
  'queryNextRace',
  'queryLastResult',
  'querySchedule',
  'queryScratches'
] as const;
export const MIN_AUTO_CONFIDENCE = .95;

export type InternalAutomationState = 'DISABLED' | 'SHADOW' | 'ASSISTED' | 'AUTOMATIC_LOW_RISK' | 'AUTOMATIC';
export type InternalAgentCandidate = {
  intent: string;
  confidence: number;
  tool: InternalAgentTool | null;
  arguments: Record<string, unknown>;
  risk: 'safe' | 'review' | 'monetary';
  source: 'deterministic' | 'model';
  modelVersion: string | null;
};

const AUTO_EXECUTABLE_TOOL_SET = new Set<InternalAgentTool>(AUTO_EXECUTABLE_TOOLS);
const DANGEROUS_KEY = /(?:^|[_-])(sql|shell|command|child[_-]?process|exec|spawn|password|token|secret|credential|cookie|authorization|prototype|constructor|__proto__)(?:$|[_-])/i;
const QUERY_TOOLS = new Set<InternalAgentTool>(AUTO_EXECUTABLE_TOOLS);
const PROPOSABLE_INTENTS = new Set(['race_open', 'race_close', 'race_result', 'result', 'day_close']);
const ALLOWED_KEYS: Record<InternalAgentTool, ReadonlySet<string>> = {
  queryRaceStatus: new Set(['text', 'raceId']),
  queryNextRace: new Set(['text']),
  queryLastResult: new Set(['text']),
  querySchedule: new Set(['text', 'date']),
  queryScratches: new Set(['text', 'raceId']),
  proposeRaceCommand: new Set(['intent', 'entities'])
};

export function isAgentTool(value: unknown): value is InternalAgentTool {
  return (AGENT_TOOLS as readonly unknown[]).includes(value);
}

export function evaluateAgentCanAct(mode: InternalAutomationState, candidate: InternalAgentCandidate) {
  if (mode === 'DISABLED' || mode === 'SHADOW' || mode === 'ASSISTED') return false;
  if (candidate.risk !== 'safe') return false;
  if (!candidate.tool || !AUTO_EXECUTABLE_TOOL_SET.has(candidate.tool)) return false;
  if (!Number.isFinite(candidate.confidence) || candidate.confidence < MIN_AUTO_CONFIDENCE) return false;
  return mode === 'AUTOMATIC_LOW_RISK' || mode === 'AUTOMATIC';
}

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

function sanitizeToolArguments(tool: InternalAgentTool, raw: unknown, risk: InternalAgentCandidate['risk']) {
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

export function buildSafeToolRequest(candidate: InternalAgentCandidate) {
  if (!candidate.tool) return null;
  if (!isAgentTool(candidate.tool)) rejected();
  const argumentsValue = sanitizeToolArguments(candidate.tool, candidate.arguments, candidate.risk);
  const encoded = JSON.stringify(argumentsValue);
  if (encoded.length > 4000 || DANGEROUS_KEY.test(encoded)) rejected();
  return { tool: candidate.tool, arguments: argumentsValue };
}
