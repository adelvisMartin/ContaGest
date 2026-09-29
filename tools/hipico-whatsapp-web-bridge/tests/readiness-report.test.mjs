import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReadiness } from '../src/readiness-report.mjs';

const BASE = Object.freeze({
  runtimeMode: 'shadow-local',
  backendSyncEnabled: false,
  ingestUrl: '',
  healthUrl: '',
  token: '',
  sourceMatches: ['CLUB HIPICO TRIPLE CROWN'],
  sourceGroupId: '120363000000000001@g.us',
  sourceChannelKey: 'club-hipico-triple-crown-official',
  labGroupName: 'Control hípico lab',
  labGroupId: '120363000000000002@g.us',
  labChannelKey: 'control-hipico-lab',
  labSendEnabled: true,
  labTestInputEnabled: true,
  sourceAutoReplyEnabled: false,
  requirePinnedGroupIds: true,
  trainingJournalEnabled: true
});

test('safe LAB readiness requires Node 22, pinned distinct groups and SOURCE auto reply disabled', () => {
  const report = evaluateReadiness(BASE, { nodeVersion: '22.20.0', killSwitchActive: false });
  assert.equal(report.node22, true);
  assert.equal(report.groupBindingReady, true);
  assert.equal(report.labConfigReady, true);
  assert.equal(report.sourceAutonomousReady, false);
  assert.ok(report.reasons.includes('SOURCE_AUTO_REPLY_DISABLED'));
});

test('LAB readiness fails closed when SOURCE and LAB are not isolated', () => {
  const config = { ...BASE, labGroupId: BASE.sourceGroupId };
  const report = evaluateReadiness(config, { nodeVersion: '22.20.0', killSwitchActive: false });
  assert.equal(report.groupBindingReady, false);
  assert.equal(report.labConfigReady, false);
});

test('SOURCE autonomous readiness needs production config, kill switch off and live sourceSendPossible evidence', () => {
  const config = {
    ...BASE,
    runtimeMode: 'production',
    backendSyncEnabled: true,
    ingestUrl: 'https://example.invalid/api/v1/hipico-bot/bridge/events',
    healthUrl: 'https://example.invalid/api/v1/hipico-bot/bridge/health',
    token: 'x'.repeat(40),
    sourceAutoReplyEnabled: true,
    labSendEnabled: false,
    labTestInputEnabled: false
  };
  assert.equal(evaluateReadiness(config, { nodeVersion: '22.20.0', killSwitchActive: true, health: { sourceSendPossible: true } }).sourceAutonomousReady, false);
  assert.equal(evaluateReadiness(config, { nodeVersion: '22.20.0', killSwitchActive: false, health: { sourceSendPossible: false } }).sourceAutonomousReady, false);
  assert.equal(evaluateReadiness(config, { nodeVersion: '22.20.0', killSwitchActive: false, health: { sourceSendPossible: true } }).sourceAutonomousReady, true);
});

test('readiness report never includes bridge token or chat contents', () => {
  const report = evaluateReadiness({ ...BASE, token: 'super-secret-token-value-never-print' }, { nodeVersion: '22.20.0', killSwitchActive: false });
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /super-secret-token-value-never-print/);
  assert.doesNotMatch(serialized, /token/i);
});
