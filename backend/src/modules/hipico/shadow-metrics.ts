import crypto from 'node:crypto';
import type { AutomationIntentMetrics, AutomationMetrics, AutomationMetricWindow } from './agent-contracts.js';

export const SHADOW_METRIC_SCHEMA_VERSION = 'v7';
export const SHADOW_RECENT_WINDOW_DAYS = 30;
export const SHADOW_PROMOTION_GATE_VERSION = 'v7-dual-window-1';

function nonNegativeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function normalizeMetricWindow(value: Partial<Record<keyof AutomationMetricWindow, unknown>> | null | undefined): AutomationMetricWindow {
  const row = value || {};
  const reviewed = Math.trunc(nonNegativeNumber(row.reviewed));
  return {
    reviewed,
    matched: Math.min(reviewed, Math.trunc(nonNegativeNumber(row.matched))),
    highRiskFalsePositive: Math.trunc(nonNegativeNumber(row.highRiskFalsePositive)),
    unauthorizedAction: Math.trunc(nonNegativeNumber(row.unauthorizedAction)),
    conflicts: Math.trunc(nonNegativeNumber(row.conflicts)),
    abstentions: Math.trunc(nonNegativeNumber(row.abstentions)),
    raceContextErrors: Math.trunc(nonNegativeNumber(row.raceContextErrors))
  };
}

export function metricRates(value: AutomationMetricWindow) {
  const row = normalizeMetricWindow(value);
  if (!row.reviewed) {
    return { accuracy: 0, conflictRate: 1, abstentionRate: 1, raceContextErrorRate: 1 };
  }
  return {
    accuracy: row.matched / row.reviewed,
    conflictRate: row.conflicts / row.reviewed,
    abstentionRate: Number(row.abstentions || 0) / row.reviewed,
    raceContextErrorRate: Number(row.raceContextErrors || 0) / row.reviewed
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

export function canonicalMetricsSignature(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function normalizeByIntent(input: Record<string, Partial<Record<keyof AutomationMetricWindow, unknown>>> = {}) {
  return Object.fromEntries(Object.entries(input)
    .filter(([intent]) => Boolean(String(intent || '').trim()))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([intent, metrics]) => [intent, normalizeMetricWindow(metrics)])) as Record<string, AutomationIntentMetrics>;
}

export function buildAutomationMetrics(input: {
  historical: Partial<Record<keyof AutomationMetricWindow, unknown>>;
  recent: Partial<Record<keyof AutomationMetricWindow, unknown>>;
  byIntent?: Record<string, Partial<Record<keyof AutomationMetricWindow, unknown>>>;
  recentSince: string;
}): AutomationMetrics {
  const historical = normalizeMetricWindow(input.historical);
  const recent = normalizeMetricWindow(input.recent);
  const byIntent = normalizeByIntent(input.byIntent);
  const window = {
    recentDays: SHADOW_RECENT_WINDOW_DAYS,
    recentSince: input.recentSince,
    metricSchemaVersion: SHADOW_METRIC_SCHEMA_VERSION
  };
  const snapshot = {
    gateVersion: SHADOW_PROMOTION_GATE_VERSION,
    historical,
    recent,
    byIntent,
    window
  };
  return {
    ...historical,
    recent,
    byIntent,
    window,
    metricsSignature: canonicalMetricsSignature(snapshot)
  };
}

export const __test__ = { stableValue, normalizeByIntent };
