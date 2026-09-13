import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HipicoAgentEngine,
  agentCanAct,
  canPromoteAutomation,
  safeToolRequest,
  sanitizeAgentEvidence,
  sourceAutomationModeAllowed,
  validateModelCandidate,
  type DeterministicAgentParser
} from './agent-policy.js';
import { deterministicAgentParser } from './agent-engine.js';

const metrics = (overrides = {}) => ({
  reviewed: 1000,
  matched: 1000,
  highRiskFalsePositive: 0,
  unauthorizedAction: 0,
  conflicts: 0,
  ...overrides
});

void test('automation promotion is adjacent-only and requires measured gates', () => {
  assert.equal(canPromoteAutomation('DISABLED', 'SHADOW', metrics({ reviewed: 0, matched: 0 })).allowed, true);
  assert.equal(canPromoteAutomation('DISABLED', 'ASSISTED', metrics()).reason, 'INVALID_PROMOTION_PATH');
  assert.equal(canPromoteAutomation('SHADOW', 'AUTOMATIC_LOW_RISK', metrics()).reason, 'INVALID_PROMOTION_PATH');
  assert.equal(canPromoteAutomation('SHADOW', 'ASSISTED', metrics({ reviewed: 199, matched: 199 })).allowed, false);
  assert.equal(canPromoteAutomation('SHADOW', 'ASSISTED', metrics({ reviewed: 200, matched: 196 })).allowed, true);
  assert.equal(canPromoteAutomation('ASSISTED', 'AUTOMATIC_LOW_RISK', metrics({ reviewed: 500, matched: 495, conflicts: 2 })).allowed, true);
  assert.equal(canPromoteAutomation('AUTOMATIC_LOW_RISK', 'AUTOMATIC', metrics(), false).reason, 'OWNER_APPROVAL_REQUIRED');
  assert.equal(canPromoteAutomation('AUTOMATIC_LOW_RISK', 'AUTOMATIC', metrics(), true).allowed, true);
  assert.equal(canPromoteAutomation('AUTOMATIC', 'SHADOW', metrics()).reason, 'DOWNGRADE_OR_SAME_STATE');
});

void test('pinned SOURCE automation can only remain disabled or shadow', () => {
  const sourceGroupId = '120363111111111111@g.us';
  assert.equal(sourceAutomationModeAllowed(sourceGroupId, 'DISABLED', sourceGroupId), true);
  assert.equal(sourceAutomationModeAllowed(sourceGroupId, 'SHADOW', sourceGroupId), true);
  assert.equal(sourceAutomationModeAllowed(sourceGroupId, 'ASSISTED', sourceGroupId), false);
  assert.equal(sourceAutomationModeAllowed(sourceGroupId, 'AUTOMATIC_LOW_RISK', sourceGroupId), false);
  assert.equal(sourceAutomationModeAllowed(sourceGroupId, 'AUTOMATIC', sourceGroupId), false);
  assert.equal(sourceAutomationModeAllowed('120363222222222222@g.us', 'AUTOMATIC', sourceGroupId), true);
});

void test('SHADOW and ASSISTED never act and review/monetary candidates never auto-act', () => {
  const safe = { intent: 'query', confidence: .99, tool: 'queryRaceStatus' as const, arguments: {}, risk: 'safe' as const, source: 'deterministic' as const, modelVersion: null };
  assert.equal(agentCanAct('SHADOW', safe), false);
  assert.equal(agentCanAct('ASSISTED', safe), false);
  assert.equal(agentCanAct('AUTOMATIC_LOW_RISK', safe), true);
  assert.equal(agentCanAct('AUTOMATIC', { ...safe, risk: 'review' }), false);
  assert.equal(agentCanAct('AUTOMATIC', { ...safe, risk: 'monetary' }), false);
});

void test('model output is bounded and tools reject unknown or dangerous argument shapes', () => {
  const candidate = validateModelCandidate({ intent: 'query:NEXT_RACE', confidence: .9, tool: 'queryNextRace', arguments: { text: 'siguiente' }, risk: 'safe', modelVersion: 'fixture' });
  assert.equal(candidate.source, 'model');
  assert.throws(() => validateModelCandidate({ intent: 'x', confidence: 2, tool: 'queryNextRace', arguments: {}, risk: 'safe' }), /AGENT_CANDIDATE_SCHEMA_INVALID/);
  assert.throws(() => safeToolRequest({ ...candidate, arguments: { shell: 'rm -rf /' } }), /AGENT_TOOL_ARGUMENTS_REJECTED/);
  assert.throws(() => safeToolRequest({ ...candidate, arguments: { text: 'ok', unexpected: true } }), /AGENT_TOOL_ARGUMENTS_REJECTED/);
  assert.throws(() => safeToolRequest({ ...candidate, arguments: { text: 'x'.repeat(1001) } }), /AGENT_TOOL_ARGUMENTS_REJECTED/);
  assert.deepEqual(safeToolRequest(candidate), { tool: 'queryNextRace', arguments: { text: 'siguiente' } });
});

void test('agent evidence recursively rejects secret-shaped keys and unsafe structures', () => {
  assert.deepEqual(sanitizeAgentEvidence({ source: 'fixture', nested: { score: 7 }, tags: ['safe', 2, true, null] }), {
    source: 'fixture', nested: { score: 7 }, tags: ['safe', 2, true, null]
  });
  assert.throws(() => sanitizeAgentEvidence({ metadata: { authorization: 'Bearer secret' } }), /HIPICO_AGENT_EVIDENCE_FORBIDDEN_KEY/);
  assert.throws(() => sanitizeAgentEvidence({ items: [{ api_key: 'secret' }] }), /HIPICO_AGENT_EVIDENCE_FORBIDDEN_KEY/);
  assert.throws(() => sanitizeAgentEvidence({ metadata: { constructor: 'x' } }), /HIPICO_AGENT_EVIDENCE_FORBIDDEN_KEY/);
  assert.throws(() => sanitizeAgentEvidence({ amount: Number.POSITIVE_INFINITY }), /HIPICO_AGENT_EVIDENCE_INVALID/);
  assert.throws(() => sanitizeAgentEvidence({ huge: 'x'.repeat(17 * 1024) }), /HIPICO_AGENT_EVIDENCE_TOO_LARGE/);

  let deep: any = { value: 'ok' };
  for (let i = 0; i < 10; i += 1) deep = { child: deep };
  assert.throws(() => sanitizeAgentEvidence(deep), /HIPICO_AGENT_EVIDENCE_TOO_DEEP/);

  const circular: any = {};
  circular.self = circular;
  assert.throws(() => sanitizeAgentEvidence(circular), /HIPICO_AGENT_EVIDENCE_INVALID/);
});

void test('proposeRaceCommand accepts only review-risk lifecycle candidates', () => {
  const base = validateModelCandidate({
    intent: 'race_close',
    confidence: .99,
    tool: 'proposeRaceCommand',
    arguments: { intent: 'race_close', entities: { raceNumber: 4, racetrack: 'La Rinconada' } },
    risk: 'review'
  });
  assert.equal(safeToolRequest(base)?.tool, 'proposeRaceCommand');
  assert.throws(() => safeToolRequest({ ...base, risk: 'safe' }), /AGENT_TOOL_ARGUMENTS_REJECTED/);
  assert.throws(() => safeToolRequest({ ...base, arguments: { intent: 'settlement', entities: {} } }), /AGENT_TOOL_ARGUMENTS_REJECTED/);
});

void test('deterministic parser handles race queries before any optional model', () => {
  const parsed = deterministicAgentParser.parse('¿Cuál es la próxima carrera?');
  assert.equal(parsed.intent, 'query:NEXT_RACE');
  assert.equal(parsed.tool, 'queryNextRace');
  assert.equal(parsed.risk, 'safe');
});

void test('optional model remains a candidate and cannot bypass SHADOW policy', async () => {
  const weak: DeterministicAgentParser = { parse: () => ({ intent: 'unknown', confidence: .2, tool: null, arguments: {}, risk: 'review' }) };
  const engine = new HipicoAgentEngine(weak, {
    id: 'fixture-model',
    async generate() { return { intent: 'query', confidence: .9, tool: 'queryRaceStatus', arguments: { text: 'estado' }, risk: 'safe' }; }
  });
  const result = await engine.evaluate('mensaje', 'SHADOW');
  assert.equal(result.candidate.source, 'model');
  assert.equal(result.canAct, false);
  assert.equal(result.toolRequest?.tool, 'queryRaceStatus');
});
