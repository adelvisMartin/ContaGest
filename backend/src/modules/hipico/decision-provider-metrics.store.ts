import type { DecisionProviderMetrics } from './decision-provider-metrics.js';
import {
  buildDecisionProviderMetrics,
  DECISION_PROVIDER_RECENT_WINDOW_DAYS
} from './decision-provider-metrics.js';
import {
  type AutomationDbClient,
  type AutomationScope,
  validatedAutomationScope
} from './automation-scope.js';
import { JEV_PROVIDER_ID } from './jev-decision-provider.js';

type ProviderMetricRow = {
  evaluations: bigint | number;
  observed: bigint | number;
  unavailable: bigint | number;
  skipped: bigint | number;
  reviewedObserved: bigint | number;
  intentClassMatched: bigint | number;
  safetyDisagreements: bigint | number;
};

type ProviderIntentMetricRow = {
  expectedClass: string;
  reviewedObserved: bigint | number;
  intentClassMatched: bigint | number;
};

async function readProviderMetricWindow(
  db: AutomationDbClient,
  input: AutomationScope,
  recentOnly: boolean
) {
  const rows = recentOnly
    ? await db.$queryRaw<ProviderMetricRow[]>`
      WITH provider_eval AS (
        SELECT
          actual_intent,
          risk,
          policy_disposition,
          evidence #>> '{decisionProvider,status}' AS provider_status,
          evidence #>> '{decisionProvider,decision,intentClass}' AS provider_intent_class,
          CASE
            WHEN actual_intent IN ('query:RACE_STATUS','status_non_monetary') THEN 'query_race_status'
            WHEN actual_intent = 'query:NEXT_RACE' THEN 'query_next_race'
            WHEN actual_intent = 'query:LAST_RESULT' THEN 'query_last_result'
            WHEN actual_intent = 'query:SCHEDULE' THEN 'query_schedule'
            WHEN actual_intent = 'query:SCRATCHES' THEN 'query_scratches'
            WHEN actual_intent IN ('race_open','race_close','race_result','day_close') THEN 'lifecycle'
            WHEN actual_intent IN (
              'balance_snapshot','settlement_snapshot','plan_snapshot','pending_confirmation',
              'cancel_or_correction','offer_confirmation','offer_receiver','offer_player',
              'polla_or_parley','betting_or_balance'
            ) THEN 'monetary'
            WHEN actual_intent = 'security_review' THEN 'security'
            WHEN actual_intent IN ('greeting','help') THEN 'greeting_help'
            ELSE 'unknown'
          END AS expected_class,
          CASE
            WHEN COALESCE(evidence #>> '{decisionProvider,decision,humanReviewProbability}', '') ~ '^(?:0(?:\\.[0-9]+)?|1(?:\\.0+)?)$'
            THEN (evidence #>> '{decisionProvider,decision,humanReviewProbability}')::numeric
            ELSE NULL
          END AS human_review_probability
        FROM public.hipico_agent_evaluations
        WHERE owner_id = ${input.ownerId}::uuid
          AND group_key = ${input.groupKey}
          AND group_id = ${input.groupId}
          AND evidence #>> '{decisionProvider,providerId}' = ${JEV_PROVIDER_ID}
          AND created_at >= now() - interval '30 days'
      )
      SELECT
        count(*) AS evaluations,
        count(*) FILTER (WHERE provider_status = 'OBSERVED') AS observed,
        count(*) FILTER (WHERE provider_status = 'UNAVAILABLE') AS unavailable,
        count(*) FILTER (WHERE provider_status = 'SKIPPED') AS skipped,
        count(*) FILTER (WHERE provider_status = 'OBSERVED' AND actual_intent IS NOT NULL) AS "reviewedObserved",
        count(*) FILTER (
          WHERE provider_status = 'OBSERVED'
            AND actual_intent IS NOT NULL
            AND provider_intent_class = expected_class
        ) AS "intentClassMatched",
        count(*) FILTER (
          WHERE provider_status = 'OBSERVED'
            AND (risk IN ('review','monetary') OR policy_disposition IN ('HUMAN_REQUIRED','DENY'))
            AND COALESCE(human_review_probability, 0) < 0.5
        ) AS "safetyDisagreements"
      FROM provider_eval`
    : await db.$queryRaw<ProviderMetricRow[]>`
      WITH provider_eval AS (
        SELECT
          actual_intent,
          risk,
          policy_disposition,
          evidence #>> '{decisionProvider,status}' AS provider_status,
          evidence #>> '{decisionProvider,decision,intentClass}' AS provider_intent_class,
          CASE
            WHEN actual_intent IN ('query:RACE_STATUS','status_non_monetary') THEN 'query_race_status'
            WHEN actual_intent = 'query:NEXT_RACE' THEN 'query_next_race'
            WHEN actual_intent = 'query:LAST_RESULT' THEN 'query_last_result'
            WHEN actual_intent = 'query:SCHEDULE' THEN 'query_schedule'
            WHEN actual_intent = 'query:SCRATCHES' THEN 'query_scratches'
            WHEN actual_intent IN ('race_open','race_close','race_result','day_close') THEN 'lifecycle'
            WHEN actual_intent IN (
              'balance_snapshot','settlement_snapshot','plan_snapshot','pending_confirmation',
              'cancel_or_correction','offer_confirmation','offer_receiver','offer_player',
              'polla_or_parley','betting_or_balance'
            ) THEN 'monetary'
            WHEN actual_intent = 'security_review' THEN 'security'
            WHEN actual_intent IN ('greeting','help') THEN 'greeting_help'
            ELSE 'unknown'
          END AS expected_class,
          CASE
            WHEN COALESCE(evidence #>> '{decisionProvider,decision,humanReviewProbability}', '') ~ '^(?:0(?:\\.[0-9]+)?|1(?:\\.0+)?)$'
            THEN (evidence #>> '{decisionProvider,decision,humanReviewProbability}')::numeric
            ELSE NULL
          END AS human_review_probability
        FROM public.hipico_agent_evaluations
        WHERE owner_id = ${input.ownerId}::uuid
          AND group_key = ${input.groupKey}
          AND group_id = ${input.groupId}
          AND evidence #>> '{decisionProvider,providerId}' = ${JEV_PROVIDER_ID}
      )
      SELECT
        count(*) AS evaluations,
        count(*) FILTER (WHERE provider_status = 'OBSERVED') AS observed,
        count(*) FILTER (WHERE provider_status = 'UNAVAILABLE') AS unavailable,
        count(*) FILTER (WHERE provider_status = 'SKIPPED') AS skipped,
        count(*) FILTER (WHERE provider_status = 'OBSERVED' AND actual_intent IS NOT NULL) AS "reviewedObserved",
        count(*) FILTER (
          WHERE provider_status = 'OBSERVED'
            AND actual_intent IS NOT NULL
            AND provider_intent_class = expected_class
        ) AS "intentClassMatched",
        count(*) FILTER (
          WHERE provider_status = 'OBSERVED'
            AND (risk IN ('review','monetary') OR policy_disposition IN ('HUMAN_REQUIRED','DENY'))
            AND COALESCE(human_review_probability, 0) < 0.5
        ) AS "safetyDisagreements"
      FROM provider_eval`;
  return rows[0] || {
    evaluations: 0,
    observed: 0,
    unavailable: 0,
    skipped: 0,
    reviewedObserved: 0,
    intentClassMatched: 0,
    safetyDisagreements: 0
  };
}

async function readProviderIntentMetrics(db: AutomationDbClient, input: AutomationScope) {
  const rows = await db.$queryRaw<ProviderIntentMetricRow[]>`
    WITH provider_eval AS (
      SELECT
        actual_intent,
        evidence #>> '{decisionProvider,status}' AS provider_status,
        evidence #>> '{decisionProvider,decision,intentClass}' AS provider_intent_class,
        CASE
          WHEN actual_intent IN ('query:RACE_STATUS','status_non_monetary') THEN 'query_race_status'
          WHEN actual_intent = 'query:NEXT_RACE' THEN 'query_next_race'
          WHEN actual_intent = 'query:LAST_RESULT' THEN 'query_last_result'
          WHEN actual_intent = 'query:SCHEDULE' THEN 'query_schedule'
          WHEN actual_intent = 'query:SCRATCHES' THEN 'query_scratches'
          WHEN actual_intent IN ('race_open','race_close','race_result','day_close') THEN 'lifecycle'
          WHEN actual_intent IN (
            'balance_snapshot','settlement_snapshot','plan_snapshot','pending_confirmation',
            'cancel_or_correction','offer_confirmation','offer_receiver','offer_player',
            'polla_or_parley','betting_or_balance'
          ) THEN 'monetary'
          WHEN actual_intent = 'security_review' THEN 'security'
          WHEN actual_intent IN ('greeting','help') THEN 'greeting_help'
          ELSE 'unknown'
        END AS expected_class
      FROM public.hipico_agent_evaluations
      WHERE owner_id = ${input.ownerId}::uuid
        AND group_key = ${input.groupKey}
        AND group_id = ${input.groupId}
        AND evidence #>> '{decisionProvider,providerId}' = ${JEV_PROVIDER_ID}
    )
    SELECT
      expected_class AS "expectedClass",
      count(*) FILTER (WHERE provider_status = 'OBSERVED' AND actual_intent IS NOT NULL) AS "reviewedObserved",
      count(*) FILTER (
        WHERE provider_status = 'OBSERVED'
          AND actual_intent IS NOT NULL
          AND provider_intent_class = expected_class
      ) AS "intentClassMatched"
    FROM provider_eval
    WHERE actual_intent IS NOT NULL
    GROUP BY expected_class
    ORDER BY expected_class ASC`;
  return Object.fromEntries(rows.map((row) => [row.expectedClass, {
    reviewedObserved: Number(row.reviewedObserved),
    intentClassMatched: Number(row.intentClassMatched)
  }]));
}

async function readProviderRecentSince(db: AutomationDbClient) {
  const rows = await db.$queryRaw<Array<{ recentSince: Date | string }>>`
    SELECT now() - (${DECISION_PROVIDER_RECENT_WINDOW_DAYS}::int * interval '1 day') AS "recentSince"`;
  return new Date(rows[0]?.recentSince || Date.now()).toISOString();
}

export async function readDecisionProviderMetricsSnapshot(
  db: AutomationDbClient,
  ownerId: string,
  groupKey: string,
  groupId: string
): Promise<DecisionProviderMetrics> {
  const input = validatedAutomationScope({ ownerId, groupKey, groupId });
  const [historical, recent, byIntentClass, recentSince] = await Promise.all([
    readProviderMetricWindow(db, input, false),
    readProviderMetricWindow(db, input, true),
    readProviderIntentMetrics(db, input),
    readProviderRecentSince(db)
  ]);
  return buildDecisionProviderMetrics({
    providerId: JEV_PROVIDER_ID,
    historical,
    recent,
    byIntentClass,
    recentSince
  });
}

export const __test__ = {
  readProviderMetricWindow,
  readProviderIntentMetrics,
  readProviderRecentSince
};
