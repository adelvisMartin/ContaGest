import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHipicoVersion } from './hipico-system.service.js';

test('canonical version prefers explicit Control Hípico product version and candidate SHA', () => {
  const version = buildHipicoVersion({
    HIPICO_PRODUCT_VERSION: '1.13.0-rc3',
    GIT_COMMIT_SHA: 'abc123def456',
    HIPICO_BRIDGE_PROTOCOL_VERSION: '1'
  });
  assert.equal(version.productVersion, '1.13.0-rc3');
  assert.equal(version.buildSha, 'abc123def456');
  assert.equal(version.apiVersion, '1');
  assert.equal(version.bridgeProtocolVersion, '1');
});

test('canonical version sanitizes untrusted SHA metadata and never echoes unrelated secrets', () => {
  const version = buildHipicoVersion({
    HIPICO_PRODUCT_VERSION: '1.13.0-rc3',
    GIT_COMMIT_SHA: 'abc123\nsecret=value',
    HIPICO_BRIDGE_PROTOCOL_VERSION: '1',
    HIPICO_GROUP_BRIDGE_TOKEN: 'must-never-appear'
  });
  assert.equal(version.buildSha, 'abc123secretvalue');
  assert.equal(JSON.stringify(version).includes('must-never-appear'), false);
});
