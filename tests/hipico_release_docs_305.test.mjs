import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const guide = readFileSync(new URL('../docs/hipico/CONTROL_HIPICO_V1130_RELEASE_AND_QA.md', import.meta.url), 'utf8');
const wrapper = JSON.parse(readFileSync(new URL('../android/hipico-control-v1130/package.json', import.meta.url), 'utf8'));
const bridge = JSON.parse(readFileSync(new URL('../tools/hipico-whatsapp-web-bridge/package.json', import.meta.url), 'utf8'));

test('#305 release guide tracks the actual PWA/Android and Bridge candidate versions', () => {
  assert.equal(wrapper.version, '1.13.0-rc3');
  assert.match(guide, /Control Hípico v1\.13\.0 RC3/);
  assert.match(guide, /\*\*Versión app:\*\* `1\.13\.0-rc3`/);
  assert.match(guide, new RegExp(`\\*\\*Bridge WhatsApp Web:\\*\\* \\`${bridge.version.replaceAll('.', '\\.') }\\``));
  assert.match(guide, /Hipico-Control-v1\.13\.0-rc3-debug\.apk/);
  assert.doesNotMatch(guide, /1\.13\.0-rc2|Bridge WhatsApp Web v1\.4\.1/);
});

test('#305 release guide documents optional external provider and outbound fail-closed controls', () => {
  for (const key of [
    'HIPICO_RACE_PROVIDER',
    'HIPICO_RACE_PROVIDER_BASE_URL',
    'HIPICO_SPORTRADAR_UOF_TOKEN',
    'HIPICO_RACE_PROVIDER_STALE_TTL_MS',
    'HIPICO_CLOUD_SEND_ENABLED',
    'HIPICO_CLOUD_SEND_CANDIDATE_SHA',
    'HIPICO_CLOUD_ALLOWED_DESTINATIONS',
    'WHATSAPP_CLOUD_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID'
  ]) assert.match(guide, new RegExp(`\\b${key}\\b`), `missing release configuration contract ${key}`);
  assert.match(guide, /enrichment/i);
  assert.match(guide, /financialAuthority=false/);
  assert.match(guide, /effectsAllowed=false/);
  assert.match(guide, /opcional/i);
  assert.match(guide, /fail-closed/i);
});
