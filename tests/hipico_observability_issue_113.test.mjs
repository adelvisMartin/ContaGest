import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const obs = 'tools/hipico-whatsapp-web-bridge/src/observability.mjs';
const cli = 'tools/hipico-whatsapp-web-bridge/src/support-bundle.mjs';
const docs = 'docs/hipico/OBSERVABILITY_SUPPORT.md';

test('issue #113 keeps central redaction, health states, rotation and allow-listed support bundle under contract', async () => {
  const [source, supportCli, guide] = await Promise.all([
    fs.readFile(obs, 'utf8'), fs.readFile(cli, 'utf8'), fs.readFile(docs, 'utf8')
  ]);
  assert.match(source, /redactDiagnostic/);
  assert.match(source, /SOURCE_SEND_GUARD_INVALID/);
  assert.match(source, /BACKLOG_OLD/);
  assert.match(source, /rotateFileIfNeeded/);
  assert.match(source, /SUPPORT_FILE_NOT_ALLOWLISTED/);
  assert.match(source, /sha256Text/);
  assert.match(supportCli, /HIPICO_BUILD_SHA|GITHUB_SHA/);
  assert.match(guide, /Chrome\/Edge\/WhatsApp profile files/);
  assert.match(guide, /24–72h soak evidence is owned by #120/);
});
