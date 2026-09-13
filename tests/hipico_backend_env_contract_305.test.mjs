import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const example = readFileSync(new URL('../backend/.env.example', import.meta.url), 'utf8');

function envValue(name) {
  const match = example.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

const requiredKeys = [
  'HIPICO_OWNER_ID',
  'HIPICO_OPERATOR_CONTROL_TOKEN',
  'HIPICO_BOT_OPERATOR_TOKEN',
  'HIPICO_GROUP_BRIDGE_TOKEN',
  'HIPICO_SOURCE_GROUP_ID',
  'HIPICO_LAB_GROUP_ID',
  'HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY',
  'HIPICO_SOURCE_CHANNEL_KEY',
  'HIPICO_LAB_CHANNEL_KEY',
  'HIPICO_BOT_PROMOTION',
  'HIPICO_SUPABASE_URL',
  'HIPICO_SUPABASE_SERVICE_ROLE_KEY',
  'HIPICO_INTERNAL_API_TOKEN',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_CLOUD_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_GRAPH_API_VERSION',
  'WHATSAPP_GRAPH_VERSION',
  'HIPICO_CLOUD_SEND_ENABLED',
  'HIPICO_WHATSAPP_COMPLIANCE_DECISION',
  'HIPICO_CLOUD_SEND_APPROVED_BY',
  'HIPICO_CLOUD_SEND_CANDIDATE_SHA',
  'HIPICO_CLOUD_ALLOWED_DESTINATIONS',
  'HIPICO_CLOUD_SEND_TIMEOUT_MS',
  'HIPICO_RACE_PROVIDER',
  'HIPICO_RACE_PROVIDER_BASE_URL',
  'HIPICO_SPORTRADAR_UOF_TOKEN',
  'HIPICO_RACE_PROVIDER_LANGUAGE',
  'HIPICO_RACE_PROVIDER_TIMEOUT_MS',
  'HIPICO_RACE_PROVIDER_CACHE_TTL_MS',
  'HIPICO_RACE_PROVIDER_STALE_TTL_MS',
  'HIPICO_RACE_PROVIDER_FAILURE_THRESHOLD',
  'HIPICO_RACE_PROVIDER_BACKOFF_MS'
];

test('#305 backend env example documents every canonical Hípico runtime/config boundary', () => {
  for (const key of requiredKeys) assert.notEqual(envValue(key), null, `missing ${key}`);
});

test('#305 example remains fail-closed and never ships Hípico secrets or real group/provider identities', () => {
  assert.equal(envValue('HIPICO_BOT_PROMOTION'), 'shadow');
  assert.equal(envValue('HIPICO_CLOUD_SEND_ENABLED'), 'false');
  assert.equal(envValue('HIPICO_RACE_PROVIDER'), 'disabled');
  for (const secretOrIdentity of [
    'HIPICO_OWNER_ID',
    'HIPICO_OPERATOR_CONTROL_TOKEN',
    'HIPICO_BOT_OPERATOR_TOKEN',
    'HIPICO_GROUP_BRIDGE_TOKEN',
    'HIPICO_SOURCE_GROUP_ID',
    'HIPICO_LAB_GROUP_ID',
    'HIPICO_SUPABASE_URL',
    'HIPICO_SUPABASE_SERVICE_ROLE_KEY',
    'HIPICO_INTERNAL_API_TOKEN',
    'WHATSAPP_VERIFY_TOKEN',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_CLOUD_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'HIPICO_WHATSAPP_COMPLIANCE_DECISION',
    'HIPICO_CLOUD_SEND_APPROVED_BY',
    'HIPICO_CLOUD_SEND_CANDIDATE_SHA',
    'HIPICO_CLOUD_ALLOWED_DESTINATIONS',
    'HIPICO_RACE_PROVIDER_BASE_URL',
    'HIPICO_SPORTRADAR_UOF_TOKEN'
  ]) assert.equal(envValue(secretOrIdentity), '', `${secretOrIdentity} must stay empty in the committed example`);
});

test('#305 example uses canonical names and labels legacy aliases as compatibility only', () => {
  assert.equal(envValue('WHATSAPP_GRAPH_API_VERSION'), 'v23.0');
  assert.equal(envValue('WHATSAPP_GRAPH_VERSION'), 'v23.0');
  assert.equal(envValue('HIPICO_CLOUD_SEND_TIMEOUT_MS'), '12000');
  assert.equal(envValue('HIPICO_RACE_PROVIDER_LANGUAGE'), 'en');
  assert.match(example, /compat[^\n]*HIPICO_BOT_OPERATOR_TOKEN|HIPICO_BOT_OPERATOR_TOKEN[^\n]*compat/i);
  assert.match(example, /compat[^\n]*WHATSAPP_GRAPH_VERSION|WHATSAPP_GRAPH_VERSION[^\n]*compat/i);
  assert.match(example, /compat[^\n]*HIPICO_SOURCE_CHANNEL_KEY|HIPICO_SOURCE_CHANNEL_KEY[^\n]*compat/i);
  assert.match(example, /HIPICO_META_[A-Z_]+[^\n]*compat|compat[^\n]*HIPICO_META_[A-Z_]+/i);
  assert.match(example, /SOURCE.*read-only/i);
  assert.match(example, /Cloud.*individual/i);
  assert.match(example, /enrichment/i);
});
