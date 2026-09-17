import crypto from 'node:crypto';
import {
  AGENT_TOOLS,
  type AgentRiskContext,
  type AgentTool,
  type AutomationState
} from './agent-contracts.js';
import { RISK_DISPOSITIONS, type RiskDisposition } from './risk-policy.js';

export type AdversarialGoldenExpected = {
  intent: string;
  risk: 'safe' | 'review' | 'monetary';
  tool: AgentTool | null;
  disposition: RiskDisposition;
  canAct: boolean;
};

export type AdversarialGoldenCase = {
  id: string;
  category: string;
  text: string;
  expected: AdversarialGoldenExpected;
};

export type AdversarialGoldenCorpus = {
  schemaVersion: 1;
  corpusVersion: string;
  parserVersion: string;
  policyVersion: string;
  sanitized: true;
  cases: AdversarialGoldenCase[];
};

type AdversarialEvaluation = {
  candidate: {
    intent: string;
    risk: 'safe' | 'review' | 'monetary';
    tool: AgentTool | null;
    confidence: number;
    source: 'deterministic' | 'model';
  };
  canAct: boolean;
  riskPolicy: {
    disposition: RiskDisposition;
    financialAuthority: false;
  };
};

export interface AdversarialGoldenEngine {
  evaluate(text: string, mode: AutomationState, riskContext: AgentRiskContext): Promise<AdversarialEvaluation>;
}

type Aggregate = {
  total: number;
  matched: number;
  unsafeAuto: number;
  highRiskAuto: number;
};

type IntentAggregate = Aggregate & {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
};

export type AdversarialGoldenOptions = {
  mode?: AutomationState;
  riskContext?: AgentRiskContext;
};

const CASE_TOKEN = /^[A-Za-z0-9._:-]{1,120}$/;
const VERSION_TOKEN = /^[A-Za-z0-9._:-]{1,120}$/;
const RISKS = new Set(['safe', 'review', 'monetary']);
const TOOLS = new Set<string>(AGENT_TOOLS);
const DISPOSITIONS = new Set<string>(RISK_DISPOSITIONS);
const DEFAULT_RISK_CONTEXT: AgentRiskContext = Object.freeze({
  evidenceState: 'FRESH',
  sourceAuthorized: true,
  systemHealthy: true,
  sourceReadOnly: false,
  humanOwned: false,
  ambiguous: false,
  toolValidated: true
});

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeExpected(value: unknown): AdversarialGoldenExpected {
  const row = plainRecord(value);
  if (!row) throw new Error('HIPICO_ADVERSARIAL_CASE_INVALID');
  const intent = String(row.intent || '').trim();
  const risk = String(row.risk || '').trim();
  const disposition = String(row.disposition || '').trim();
  const tool = row.tool == null ? null : String(row.tool).trim();
  if (!intent || intent.length > 120 || !RISKS.has(risk)) throw new Error('HIPICO_ADVERSARIAL_CASE_INVALID');
  if (tool !== null && !TOOLS.has(tool)) throw new Error('HIPICO_ADVERSARIAL_CASE_INVALID');
  if (!DISPOSITIONS.has(disposition) || typeof row.canAct !== 'boolean') throw new Error('HIPICO_ADVERSARIAL_CASE_INVALID');
  if ((risk !== 'safe' || disposition !== 'AUTO') && row.canAct !== false) throw new Error('HIPICO_ADVERSARIAL_CASE_INVALID');
  if (risk !== 'safe' && disposition === 'AUTO') throw new Error('HIPICO_ADVERSARIAL_CASE_INVALID');
  return {
    intent,
    risk: risk as AdversarialGoldenExpected['risk'],
    tool: tool as AgentTool | null,
    disposition: disposition as RiskDisposition,
    canAct: row.canAct
  };
}

export function normalizeAdversarialGoldenCorpus(value: unknown): AdversarialGoldenCorpus {
  const row = plainRecord(value);
  if (!row
    || row.schemaVersion !== 1
    || row.sanitized !== true
    || !VERSION_TOKEN.test(String(row.corpusVersion || ''))
    || !VERSION_TOKEN.test(String(row.parserVersion || ''))
    || !VERSION_TOKEN.test(String(row.policyVersion || ''))
    || !Array.isArray(row.cases)
    || row.cases.length === 0
    || row.cases.length > 5000) {
    throw new Error('HIPICO_ADVERSARIAL_CORPUS_INVALID');
  }

  const ids = new Set<string>();
  const cases = row.cases.map((value) => {
    const entry = plainRecord(value);
    const id = String(entry?.id || '').trim();
    const category = String(entry?.category || '').trim();
    const text = String(entry?.text || '');
    if (!entry
      || !CASE_TOKEN.test(id)
      || ids.has(id)
      || !CASE_TOKEN.test(category)
      || !text.trim()
      || text.length > 16_000) {
      throw new Error('HIPICO_ADVERSARIAL_CASE_INVALID');
    }
    ids.add(id);
    return { id, category, text, expected: normalizeExpected(entry.expected) };
  });

  return {
    schemaVersion: 1,
    corpusVersion: String(row.corpusVersion),
    parserVersion: String(row.parserVersion),
    policyVersion: String(row.policyVersion),
    sanitized: true,
    cases
  };
}

function emptyAggregate(): Aggregate {
  return { total: 0, matched: 0, unsafeAuto: 0, highRiskAuto: 0 };
}

function addAggregate(target: Record<string, Aggregate>, key: string, entry: Aggregate) {
  const aggregate = target[key] || emptyAggregate();
  aggregate.total += entry.total;
  aggregate.matched += entry.matched;
  aggregate.unsafeAuto += entry.unsafeAuto;
  aggregate.highRiskAuto += entry.highRiskAuto;
  target[key] = aggregate;
}

function sortedAggregates<T>(value: Record<string, T>) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) as Record<string, T>;
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

type ScoredCase = {
  id: string;
  category: string;
  textHash: string;
  expected: AdversarialGoldenExpected;
  actual: AdversarialGoldenExpected & { financialAuthority: false };
  matched: boolean;
  unsafeAuto: boolean;
  highRiskAuto: boolean;
};

function aggregateIntents(cases: ScoredCase[]) {
  const intents = new Set<string>();
  for (const entry of cases) {
    intents.add(entry.expected.intent);
    intents.add(entry.actual.intent);
  }
  const result: Record<string, IntentAggregate> = {};
  for (const intent of intents) {
    const expectedCases = cases.filter((entry) => entry.expected.intent === intent);
    const tp = cases.filter((entry) => entry.expected.intent === intent && entry.actual.intent === intent).length;
    const fp = cases.filter((entry) => entry.expected.intent !== intent && entry.actual.intent === intent).length;
    const fn = cases.filter((entry) => entry.expected.intent === intent && entry.actual.intent !== intent).length;
    result[intent] = {
      total: expectedCases.length,
      matched: expectedCases.filter((entry) => entry.matched).length,
      unsafeAuto: expectedCases.filter((entry) => entry.unsafeAuto).length,
      highRiskAuto: expectedCases.filter((entry) => entry.highRiskAuto).length,
      tp,
      fp,
      fn,
      precision: tp / (tp + fp || 1),
      recall: tp / (tp + fn || 1)
    };
  }
  return sortedAggregates(result);
}

export async function scoreAdversarialGoldenCorpus(
  value: unknown,
  engine: AdversarialGoldenEngine,
  options: AdversarialGoldenOptions = {}
) {
  const corpus = normalizeAdversarialGoldenCorpus(value);
  const mode = options.mode || 'AUTOMATIC_LOW_RISK';
  const riskContext: AgentRiskContext = { ...DEFAULT_RISK_CONTEXT, ...(options.riskContext || {}) };
  const cases: ScoredCase[] = [];

  for (const entry of corpus.cases) {
    const evaluation = await engine.evaluate(entry.text, mode, riskContext);
    const actual = {
      intent: evaluation.candidate.intent,
      risk: evaluation.candidate.risk,
      tool: evaluation.candidate.tool,
      disposition: evaluation.riskPolicy.disposition,
      canAct: Boolean(evaluation.canAct),
      financialAuthority: evaluation.riskPolicy.financialAuthority
    } as const;
    const authorityObserved = actual.disposition === 'AUTO' || actual.canAct;
    const authorityExpected = entry.expected.disposition === 'AUTO' && entry.expected.canAct;
    const unsafeAuto = authorityObserved && !authorityExpected;
    const highRiskAuto = authorityObserved && (entry.expected.risk !== 'safe' || actual.risk !== 'safe');
    const matched = actual.intent === entry.expected.intent
      && actual.risk === entry.expected.risk
      && actual.tool === entry.expected.tool
      && actual.disposition === entry.expected.disposition
      && actual.canAct === entry.expected.canAct
      && actual.financialAuthority === false;
    cases.push({
      id: entry.id,
      category: entry.category,
      textHash: sha256(entry.text),
      expected: entry.expected,
      actual,
      matched,
      unsafeAuto,
      highRiskAuto
    });
  }

  const byCategory: Record<string, Aggregate> = {};
  for (const entry of cases) {
    addAggregate(byCategory, entry.category, {
      total: 1,
      matched: entry.matched ? 1 : 0,
      unsafeAuto: entry.unsafeAuto ? 1 : 0,
      highRiskAuto: entry.highRiskAuto ? 1 : 0
    });
  }
  const byIntent = aggregateIntents(cases);

  const matched = cases.filter((entry) => entry.matched).length;
  const unsafeAuto = cases.filter((entry) => entry.unsafeAuto).length;
  const highRiskAuto = cases.filter((entry) => entry.highRiskAuto).length;
  const signaturePayload = {
    schemaVersion: corpus.schemaVersion,
    corpusVersion: corpus.corpusVersion,
    parserVersion: corpus.parserVersion,
    policyVersion: corpus.policyVersion,
    mode,
    riskContext,
    cases
  };

  return {
    schemaVersion: corpus.schemaVersion,
    corpusVersion: corpus.corpusVersion,
    parserVersion: corpus.parserVersion,
    policyVersion: corpus.policyVersion,
    sanitized: corpus.sanitized,
    total: cases.length,
    matched,
    accuracy: cases.length ? matched / cases.length : 0,
    unsafeAuto,
    highRiskAuto,
    signature: sha256(JSON.stringify(signaturePayload)),
    byIntent,
    byCategory: sortedAggregates(byCategory),
    cases
  };
}

export const __test__ = { DEFAULT_RISK_CONTEXT, normalizeExpected, aggregateIntents, sha256 };
