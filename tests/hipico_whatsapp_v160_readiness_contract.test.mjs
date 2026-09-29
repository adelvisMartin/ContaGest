import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => readFileSync(join(process.cwd(), path), 'utf8');
const config = read('tools/hipico-whatsapp-web-bridge/src/runtime-config.mjs');
const transport = read('tools/hipico-whatsapp-web-bridge/src/transport-capabilities.mjs');
const policy = read('tools/hipico-whatsapp-web-bridge/src/source-policy-gate.mjs');
const runtime = read('tools/hipico-whatsapp-web-bridge/src/index.mjs');
const journal = read('tools/hipico-whatsapp-web-bridge/src/source-reply-journal.mjs');
const replay = read('tools/hipico-whatsapp-web-bridge/src/replay-policy.mjs');
const launcher = read('tools/hipico-whatsapp-web-bridge/INICIAR.ps1');
const autonomousLauncher = read('INICIAR-HIPICO-AUTONOMO.cmd');
const versionFile = read('tools/hipico-whatsapp-web-bridge/VERSION').trim();
const pkg = JSON.parse(read('tools/hipico-whatsapp-web-bridge/package.json'));
const qa = read('docs/hipico/QA_DOWNLOAD_AND_BOT_TEST.md');
const readiness = read('docs/hipico/WHATSAPP_READINESS_2026-09-29.md');

test('bridge v1.6 has one version across package, runtime launcher and user launcher', () => {
  assert.equal(pkg.version, '1.6.0');
  assert.equal(versionFile, '1.6.0');
  assert.match(config, /VERSION = '1\.6\.0'/);
  assert.match(launcher, /\$Version = '1\.6\.0'/);
  assert.match(autonomousLauncher, /v1\.6\.0/);
});

test('transport capability contract is explicit and unimplemented adapters fail closed', () => {
  assert.match(transport, /PLAYWRIGHT_WEB_TRANSPORT/);
  assert.match(transport, /official:\s*false/);
  assert.match(transport, /CLOUD_API_TRANSPORT/);
  assert.match(transport, /implemented:\s*false/);
  assert.match(config, /HIPICO_TRANSPORT_ADAPTER/);
  assert.match(config, /todavía no está implementado/);
});

test('SOURCE writing remains code-level NO-GO under current WhatsApp Business policy', () => {
  assert.match(policy, /SOURCE_AUTO_REPLY_POLICY_NO_GO/);
  assert.match(policy, /REAL_MONEY_GAMBLING_PROHIBITED_BY_WHATSAPP_BUSINESS_POLICY/);
  assert.match(policy, /eligible:\s*false/);
  assert.match(policy, /business\.whatsapp\.com\/policy/);
  assert.match(config, /SOURCE permanece read-only/);
});

test('runtime still prevents self-loop ingestion and preserves ambiguous exactly-once semantics', () => {
  assert.match(runtime, /if \(row\.fromMe\) \{[\s\S]*SOURCE_SELF_SKIP/);
  assert.match(journal, /prepared','sending','sent','ambiguous/);
  assert.match(journal, /PROCESS_RESTART_DURING_SEND/);
  assert.match(journal, /SOURCE_REPLY_REPLAY_MISMATCH/);
  assert.match(journal, /safeToRetry===true/);
  assert.match(replay, /ambiguous/i);
});

test('browser closure supervision and LAB launchers remain part of autonomous readiness', () => {
  assert.match(launcher, /browserRestartLimit/);
  assert.match(launcher, /\$code -eq 43/);
  assert.match(launcher, /Start-Sleep -Seconds \$delay/);
  assert.match(launcher, /stopping/);
  assert.match(qa, /PROBAR-HIPICO-LAB\.cmd/);
  assert.match(qa, /INICIAR-HIPICO-AUTONOMO\.cmd/);
  assert.match(qa, /npm run source:policy/);
});

test('readiness note records current transport market and physical gaps without claiming SOURCE GO', () => {
  assert.match(readiness, /Baileys/i);
  assert.match(readiness, /WebSocket/i);
  assert.match(readiness, /Playwright/i);
  assert.match(readiness, /Cloud API/i);
  assert.match(readiness, /Apuestas con dinero real/i);
  assert.match(readiness, /NOT VERIFIED/i);
  assert.match(readiness, /SOURCE zero-send/i);
});
