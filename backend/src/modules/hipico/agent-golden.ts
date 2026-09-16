import crypto from 'node:crypto';
import {
  AUTO_EXECUTABLE_TOOLS,
  agentCanAct,
  type AgentCandidate,
  type DeterministicAgentParser
} from './agent-policy.js';

export type GoldenCase = {
  id: string;
  text: string;
  expectedIntent: string;
  risk: 'safe' | 'review' | 'monetary';
};

export type GoldenCorpus = {
  version: string;
  description?: string;
  cases: GoldenCase[];
};

type ScoredGoldenCase = {
  id: string;
  expectedIntent: string;
  predictedIntent: string;
  expectedRisk: GoldenCase['risk'];
  predictedRisk: AgentCandidate['risk'];
  confidence: number;
  tool: AgentCandidate['tool'];
  matchedIntent: boolean;
  matchedRisk: boolean;
  matched: boolean;
  autoEligible: boolean;
};

type GoldenIntentAggregate = {
  total: number;
  matched: number;
  highRiskFalsePositive: number;
  unauthorizedAutomaticAction: number;
  abstentions: number;
};

const AUTO_TOOL_SET = new Set<string>(AUTO_EXECUTABLE_TOOLS);

function normalizeCorpus(value: unknown): GoldenCorpus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('HIPICO_GOLDEN_CORPUS_INVALID');
  const row = value as Record<string, unknown>;
  const version = String(row.version || '').trim();
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(version) || !Array.isArray(row.cases) || row.cases.length === 0 || row.cases.length > 5000) {
    throw new Error('HIPICO_GOLDEN_CORPUS_INVALID');
  }
  const ids = new Set<string>();
  const cases = row.cases.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('HIPICO_GOLDEN_CASE_INVALID');
    const item = entry as Record<string, unknown>;
    const id = String(item.id || '').trim();
    const text = String(item.text || '');
    const expectedIntent = String(item.expectedIntent || '').trim();
    const risk = item.risk;
    if (!/^[A-Za-z0-9._:-]{1,120}$/.test(id) || ids.has(id) || !text.trim() || text.length > 4000 || !expectedIntent || expectedIntent.length > 120) {
      throw new Error('HIPICO_GOLDEN_CASE_INVALID');
    }
    if (risk !== 'safe' && risk !== 'review' && risk !== 'monetary') throw new Error('HIPICO_GOLDEN_CASE_INVALID');
    ids.add(id);
    return { id, text, expectedIntent, risk } as GoldenCase;
  });
  return { version, description: typeof row.description === 'string' ? row.description.slice(0, 500) : undefined, cases };
}

function isUnauthorizedAutomaticAction(entry: ScoredGoldenCase) {
  return entry.autoEligible && (!entry.tool || !AUTO_TOOL_SET.has(entry.tool));
}

function isHighRiskFalsePositive(entry: ScoredGoldenCase) {
  return entry.expectedRisk !== 'safe' && entry.autoEligible;
}

function emptyIntentAggregate(): GoldenIntentAggregate {
  return {
    total: 0,
    matched: 0,
    highRiskFalsePositive: 0,
    unauthorizedAutomaticAction: 0,
    abstentions: 0
  };
}

function aggregateByExpectedIntent(cases: ScoredGoldenCase[]) {
  const grouped = new Map<string, GoldenIntentAggregate>();
  for (const entry of cases) {
    const aggregate = grouped.get(entry.expectedIntent) || emptyIntentAggregate();
    aggregate.total += 1;
    aggregate.matched += entry.matched ? 1 : 0;
    aggregate.highRiskFalsePositive += isHighRiskFalsePositive(entry) ? 1 : 0;
    aggregate.unauthorizedAutomaticAction += isUnauthorizedAutomaticAction(entry) ? 1 : 0;
    aggregate.abstentions += entry.predictedIntent === 'unknown' ? 1 : 0;
    grouped.set(entry.expectedIntent, aggregate);
  }
  return Object.fromEntries([...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function scoreGoldenCorpus(value: unknown, parser: DeterministicAgentParser) {
  const corpus = normalizeCorpus(value);
  const cases: ScoredGoldenCase[] = corpus.cases.map((entry) => {
    const parsed = parser.parse(entry.text);
    const candidate: AgentCandidate = {
      ...parsed,
      source: 'deterministic',
      modelVersion: null
    };
    const autoEligible = agentCanAct('AUTOMATIC_LOW_RISK', candidate);
    const matchedIntent = candidate.intent === entry.expectedIntent;
    const matchedRisk = candidate.risk === entry.risk;
    return {
      id: entry.id,
      expectedIntent: entry.expectedIntent,
      predictedIntent: candidate.intent,
      expectedRisk: entry.risk,
      predictedRisk: candidate.risk,
      confidence: Number(candidate.confidence.toFixed(4)),
      tool: candidate.tool,
      matchedIntent,
      matchedRisk,
      matched: matchedIntent && matchedRisk,
      autoEligible
    };
  });

  const matched = cases.filter((entry) => entry.matched).length;
  const highRiskFalsePositive = cases.filter(isHighRiskFalsePositive).length;
  const unauthorizedAutomaticAction = cases.filter(isUnauthorizedAutomaticAction).length;

  // Preserve the pre-v7 signature payload exactly: new report aggregates are derived
  // only after this digest so downstream regression history remains comparable.
  const signature = crypto.createHash('sha256').update(JSON.stringify({ version: corpus.version, cases })).digest('hex');
  const abstentions = cases.filter((entry) => entry.predictedIntent === 'unknown').length;
  const byIntent = aggregateByExpectedIntent(cases);

  return {
    version: corpus.version,
    total: cases.length,
    matched,
    accuracy: cases.length ? matched / cases.length : 0,
    highRiskFalsePositive,
    unauthorizedAutomaticAction,
    signature,
    cases,
    abstentions,
    byIntent
  };
}

export const __test__ = { aggregateByExpectedIntent, isHighRiskFalsePositive, isUnauthorizedAutomaticAction };
