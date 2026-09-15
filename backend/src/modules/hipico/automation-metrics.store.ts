import type { AutomationMetrics } from './agent-contracts.js';
import { buildAutomationMetrics, normalizeMetricWindow } from './shadow-metrics.js';
import {
  type AutomationDbClient,
  type AutomationScope,
  validatedAutomationScope
} from './automation-scope.js';

type MetricAggregateRow = {
  reviewed: bigint | number;
  matched: bigint | number;
  highRiskFalsePositive: bigint | number;
  unauthorizedAction: bigint | number;
  conflicts: bigint | number;
  abstentions: bigint | number;
  raceContextErrors: bigint | number;
};

type IntentMetricRow = MetricAggregateRow & { actualIntent: string };

async function readHistoricalMetricWindow(db: AutomationDbClient, input: AutomationScope) {
  const rows = await db.$queryRaw<MetricAggregateRow[]>`
    SELECT
      count(*) FILTER (WHERE actual_intent IS NOT NULL) AS reviewed,
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND matched = true) AS matched,
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND high_risk_false_positive = true) AS "highRiskFalsePositive",
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND unauthorized_action = true) AS "unauthorizedAction",
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND conflict = true) AS conflicts,
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND abstained = true) AS abstentions,
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND race_context_error = true) AS "raceContextErrors"
    FROM public.hipico_agent_evaluations
    WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}`;
  return normalizeMetricWindow(rows[0] || {});
}

async function readRecentMetricWindow(db: AutomationDbClient, input: AutomationScope) {
  const rows = await db.$queryRaw<MetricAggregateRow[]>`
    SELECT
      count(*) AS reviewed,
      count(*) FILTER (WHERE matched = true) AS matched,
      count(*) FILTER (WHERE high_risk_false_positive = true) AS "highRiskFalsePositive",
      count(*) FILTER (WHERE unauthorized_action = true) AS "unauthorizedAction",
      count(*) FILTER (WHERE conflict = true) AS conflicts,
      count(*) FILTER (WHERE abstained = true) AS abstentions,
      count(*) FILTER (WHERE race_context_error = true) AS "raceContextErrors"
    FROM public.hipico_agent_evaluations
    WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
      AND actual_intent IS NOT NULL
      AND metric_schema_version = 'v7'
      AND reviewed_at >= now() - interval '30 days'`;
  return normalizeMetricWindow(rows[0] || {});
}

async function readIntentMetrics(db: AutomationDbClient, input: AutomationScope) {
  const rows = await db.$queryRaw<IntentMetricRow[]>`
    SELECT
      actual_intent AS "actualIntent",
      count(*) AS reviewed,
      count(*) FILTER (WHERE matched = true) AS matched,
      count(*) FILTER (WHERE high_risk_false_positive = true) AS "highRiskFalsePositive",
      count(*) FILTER (WHERE unauthorized_action = true) AS "unauthorizedAction",
      count(*) FILTER (WHERE conflict = true) AS conflicts,
      count(*) FILTER (WHERE abstained = true) AS abstentions,
      count(*) FILTER (WHERE race_context_error = true) AS "raceContextErrors"
    FROM public.hipico_agent_evaluations
    WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
      AND actual_intent IS NOT NULL
    GROUP BY actual_intent
    ORDER BY actual_intent ASC`;
  return Object.fromEntries(rows.map((row) => [row.actualIntent, normalizeMetricWindow(row)]));
}

async function readRecentSince(db: AutomationDbClient) {
  const rows = await db.$queryRaw<Array<{ recentSince: Date | string }>>`
    SELECT now() - interval '30 days' AS "recentSince"`;
  return new Date(rows[0]?.recentSince || Date.now()).toISOString();
}

export async function readMetricsSnapshot(
  db: AutomationDbClient,
  ownerId: string,
  groupKey: string,
  groupId: string
): Promise<AutomationMetrics> {
  const input = validatedAutomationScope({ ownerId, groupKey, groupId });
  const [historical, recent, byIntent, recentSince] = await Promise.all([
    readHistoricalMetricWindow(db, input),
    readRecentMetricWindow(db, input),
    readIntentMetrics(db, input),
    readRecentSince(db)
  ]);
  return buildAutomationMetrics({ historical, recent, byIntent, recentSince });
}

export const __test__ = {
  readHistoricalMetricWindow,
  readRecentMetricWindow,
  readIntentMetrics,
  readRecentSince
};
