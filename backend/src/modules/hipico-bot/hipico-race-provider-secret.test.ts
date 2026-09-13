import test from 'node:test';
import assert from 'node:assert/strict';
import { raceProviderStatus } from './hipico-race-provider.js';

const base = {
  HIPICO_RACE_PROVIDER: 'sportradar-uof',
  HIPICO_RACE_PROVIDER_BASE_URL: 'https://global.stgapi.betradar.com'
};

test('race provider readiness rejects missing short and public placeholder credentials', () => {
  assert.equal(raceProviderStatus(base).configured, false);
  assert.equal(raceProviderStatus({ ...base, HIPICO_SPORTRADAR_UOF_TOKEN: 'short' }).configured, false);
  assert.equal(raceProviderStatus({ ...base, HIPICO_SPORTRADAR_UOF_TOKEN: 'CHANGE_ME_SPORTRADAR_TOKEN_123456789' }).configured, false);
  assert.equal(raceProviderStatus({ ...base, HIPICO_SPORTRADAR_UOF_TOKEN: 'REEMPLAZA_CON_TOKEN_REAL_1234567890' }).configured, false);
});

test('vendor-defined provider token is accepted once it is non-placeholder and at least 16 bytes', () => {
  const status = raceProviderStatus({ ...base, HIPICO_SPORTRADAR_UOF_TOKEN: 'provider-token-1234567890' });
  assert.equal(status.configured, true);
  assert.equal(status.reason, null);
  assert.equal(JSON.stringify(status).includes('provider-token-1234567890'), false);
});
