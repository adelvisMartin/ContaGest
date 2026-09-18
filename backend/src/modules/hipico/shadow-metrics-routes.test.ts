import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routes = readFileSync(new URL('./agent.routes.ts', import.meta.url), 'utf8');
const http = readFileSync(new URL('./agent-http.ts', import.meta.url), 'utf8');

test('review schema keeps raceContextError default-false without removing existing review inputs', () => {
  assert.match(http, /actualIntent:\s*z\.string/);
  assert.match(http, /highRiskFalsePositive:\s*z\.boolean\(\)\.default\(false\)/);
  assert.match(http, /unauthorizedAction:\s*z\.boolean\(\)\.default\(false\)/);
  assert.match(http, /conflict:\s*z\.boolean\(\)\.default\(false\)/);
  assert.match(http, /raceContextError:\s*z\.boolean\(\)\.default\(false\)/);
  assert.match(routes, /raceContextError:\s*body\.raceContextError/);
});

test('automation/evaluate remains fail-closed and does not accept client metric or promotion authority fields', () => {
  const evaluateStart = http.indexOf('export const evaluateSchema');
  const reviewStart = http.indexOf('export const reviewSchema');
  const evaluateSchema = http.slice(evaluateStart, reviewStart);
  for (const forbidden of ['recent', 'metrics', 'metricsSignature', 'accuracy', 'policyContext', 'sourceAuthorized', 'systemHealthy']) {
    assert.equal(evaluateSchema.includes(forbidden), false, `evaluate schema must not accept ${forbidden}`);
  }
  assert.match(routes, /serverRiskContext\(gid\)/);
});
