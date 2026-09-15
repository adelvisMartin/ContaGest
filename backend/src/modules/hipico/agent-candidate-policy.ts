import { isAgentTool, type InternalAgentCandidate } from './agent-tool-policy.js';

function boundedString(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

export function normalizeModelCandidate(value: unknown): InternalAgentCandidate {
  const row = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const intent = boundedString(row.intent, 120);
  const confidence = Number(row.confidence);
  const tool = row.tool == null ? null : row.tool;

  if (
    !intent
    || !Number.isFinite(confidence)
    || confidence < 0
    || confidence > 1
    || (tool !== null && !isAgentTool(tool))
  ) {
    throw new Error('AGENT_CANDIDATE_SCHEMA_INVALID');
  }

  const risk = row.risk;
  if (risk !== 'safe' && risk !== 'review' && risk !== 'monetary') {
    throw new Error('AGENT_CANDIDATE_SCHEMA_INVALID');
  }

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
