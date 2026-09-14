import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./agent.routes.ts', import.meta.url), 'utf8');

test('review route adds raceContextError as an optional default-false field without removing existing review inputs', () => {
  assert.match(source, /actualIntent:\s*z\.string/);
  assert.match(source, /highRiskFalsePositive:\s*z\.boolean\(\)\.default\(false\)/);
  assert.match(source, /unauthorizedAction:\s*z\.boolean\(\)\.default\(false\)/);
  assert.match(source, /conflict:\s*z\.boolean\(\)\.default\(false\)/);
  assert.match(source, /raceContextError:\s*z\.boolean\(\)\.default\(false\)/);
  assert.match(source, /raceContextError:\s*body\.raceContextError/);
});

test('automation/evaluate remains fail-closed and does not accept client metric or promotion authority fields', () => {
  const evaluateStart = source.indexOf('const evaluateSchema');
  const reviewStart = source.indexOf('const reviewSchema');
  const evaluateSchema = source.slice(evaluateStart, reviewStart);
  for (const forbidden of ['recent', 'metrics', 'metricsSignature', 'accuracy', 'policyContext', 'sourceAuthorized', 'systemHealthy']) {
    assert.equal(evaluateSchema.includes(forbidden), false, `evaluate schema must not accept ${forbidden}`);
  }
  assert.match(source, /serverRiskContext\(gid\)/);
});
