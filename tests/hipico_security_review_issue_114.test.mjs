import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { escapeHtml } from '../frontend/public/hipico-control/assets/js/ui.js';

const read = (path) => fs.readFile(path, 'utf8');

test('hostile participant/message strings are escaped as text', () => {
  for (const payload of [
    '<img src=x onerror=alert(1)>',
    '<svg/onload=alert(1)>',
    '\"><script>alert(1)</script>',
    "' onfocus='alert(1)",
    '<a href="javascript:alert(1)">x</a>'
  ]) {
    const escaped = escapeHtml(payload);
    assert.doesNotMatch(escaped, /<script|<img|<svg|<a\s/i);
    assert.notEqual(escaped, payload);
    if (payload.includes('<')) assert.match(escaped, /&lt;/);
    if (payload.includes('>')) assert.match(escaped, /&gt;/);
    if (payload.includes('"')) assert.match(escaped, /&quot;/);
    if (payload.includes("'")) assert.match(escaped, /&#39;/);
  }
});

test('PWA deployment enforces CSP and API no-store without unsafe-eval', async () => {
  const vercel = await read('frontend/vercel.json');
  assert.match(vercel, /Content-Security-Policy/);
  assert.match(vercel, /frame-ancestors 'none'/);
  assert.match(vercel, /object-src 'none'/);
  assert.match(vercel, /Cache-Control\", \"value\": \"no-store, max-age=0/);
  assert.doesNotMatch(vercel, /unsafe-eval/);
});

test('service worker sends sensitive same-origin paths and exact-SHA metadata network-only no-store', async () => {
  const sw = await read('frontend/public/hipico-control/sw.js');
  assert.match(sw, /function isSensitive/);
  assert.match(sw, /function isRuntimeMetadata/);
  assert.match(sw, /isSensitive\(url\)\s*\|\|\s*isRuntimeMetadata\(url\)/);
  assert.match(sw, /fetch\(request, \{ cache: 'no-store' \}\)/);
  assert.match(sw, /request\.method !== 'GET'/);
});

test('backend authority cannot be weakened by user metadata or missing RPC', async () => {
  const [client, runtime] = await Promise.all([
    read('frontend/public/hipico-control/assets/js/supabase.js'),
    read('frontend/public/hipico-control/runtime-config.js')
  ]);
  const start = client.indexOf('export function sessionRole');
  const end = client.indexOf('export function isAdminSession', start);
  assert.doesNotMatch(client.slice(start, end), /user_metadata/);
  assert.match(client, /HIPICO_RPC_REQUIRED/);
  assert.match(runtime, /"deploymentMode": "production"/);
  assert.match(runtime, /"allowLabDirectTableFallback": false/);
  assert.doesNotMatch(client + runtime, /SUPABASE_SERVICE_ROLE_KEY|service_role|sb_secret_/i);
});

test('SOURCE remains read-only and LAB identity guard is explicit', async () => {
  const [bridge, identity] = await Promise.all([
    read('tools/hipico-whatsapp-web-bridge/src/index.mjs'),
    read('tools/hipico-whatsapp-web-bridge/src/group-identity.mjs')
  ]);
  assert.match(bridge, /sourceSendPossible:\s*false/);
  assert.doesNotMatch(bridge, /send(?:Message|Text|Payload)ToSource\s*\(/i);
  assert.match(bridge, /assertCurrentLabIdentity\(\)/);
  assert.match(identity, /assertPinnedGroupIdentity/);
  assert.match(identity, /sourceId/);
});

test('security model declares Critical/High as promotion blocking', async () => {
  const model = await read('docs/hipico/SECURITY_THREAT_MODEL.md');
  assert.match(model, /CRITICAL/);
  assert.match(model, /HIGH/);
  assert.match(model, /NO-GO/);
  for (const boundary of ['TB-01', 'TB-02', 'TB-03', 'TB-04', 'TB-05', 'TB-06', 'TB-07']) {
    assert.match(model, new RegExp(boundary));
  }
});
