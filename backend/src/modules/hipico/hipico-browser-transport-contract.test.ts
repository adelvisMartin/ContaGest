import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const security = readFileSync(new URL('../../shared/middleware/security.ts', import.meta.url), 'utf8');

const REQUIRED_HIPICO_BROWSER_HEADERS = [
  'x-hipico-operator-token',
  'x-hipico-group-key',
  'x-hipico-source-channel',
  'x-hipico-document-authority',
  'x-hipico-received-at',
  'x-hipico-supersedes-id',
  'x-hipico-filename',
  'x-hipico-source-message-id',
  'x-hipico-sender'
];

test('allowed browser origins may send the canonical Hípico headers consumed by provider/race/document APIs', () => {
  for (const header of REQUIRED_HIPICO_BROWSER_HEADERS) {
    assert.match(security, new RegExp(`allowedHeaders:[\\s\\S]*['\"]${header}['\"]`), `${header} must be allowed by CORS`);
  }
});

test('browser CORS never exposes the internal WhatsApp Bridge credential', () => {
  assert.doesNotMatch(security, /allowedHeaders:[\s\S]*['"]x-hipico-bridge-token['"]/);
});
