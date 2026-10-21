import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../backend/src/modules/notifications/notifications.routes.ts', import.meta.url));
const source = readFileSync(file, 'utf8');

function endpoint(name) {
  const marker = `router.post('${name}'`;
  const at = source.indexOf(marker);
  assert.ok(at >= 0, `missing ${name} route`);
  const end = source.indexOf('\n}));', at);
  assert.ok(end > at, `missing terminator for ${name}`);
  return source.slice(at, end + 5);
}

test('#854 no phantom-queue success when no durable worker exists', () => {
  const route = endpoint('/send');
  assert.match(route, /requirePermission\('sales\.manage'\)/);
  assert.match(route, /messageSchema\.parse\(req\.body \|\| \{\}\)/);
  assert.match(route, /throw new HttpError\(503,/);
  assert.doesNotMatch(route, /queued:\s*true|status:\s*['"]queued['"]/);
  assert.doesNotMatch(route, /\bok\(res,/);
  assert.doesNotMatch(route, /prisma\.|sendWhatsAppCloud\(|fetch\(/);
});

test('#854 provider acceptance does not claim delivery', () => {
  const route = endpoint('/whatsapp/order');
  assert.match(route, /requirePermission\('sales\.manage'\)/);
  // A 2xx provider response without a verified message receipt is neither
  // delivered nor a skipped send. Preserve the explicit uncertain state.
  assert.match(route, /status: result\.ok\s*\?\s*'provider_accepted'\s*:\s*result\.status===['"]provider_unverified['"]\s*\?\s*'provider_unverified'\s*:\s*'skipped'/);
  assert.match(route, /deliveryConfirmed: false/);
  assert.match(route, /delivered: false/);
  assert.doesNotMatch(route, /status:\s*result\.ok\s*\?\s*'sent'/);
});

test('#854 persisted audit data excludes raw private order/message and provider response', () => {
  const route = endpoint('/whatsapp/order');
  const payload = route.match(/payload:\s*\{([^}]+)\}/)?.[1];
  assert.ok(payload, 'expected minimal metadata payload');
  assert.match(payload, /providerAccepted: result\.ok/);
  assert.doesNotMatch(payload, /\border\b|\bmessage\b|\bresult\b(?!\.ok)|\bphone\b|\btoken\b|\bdata\b/);
  assert.match(route, /title: 'Notificación WhatsApp'/);
  assert.doesNotMatch(route, /title:.*order\.number/);
});

test('#854 raw Meta error JSON and accepted response are not exposed to clients', () => {
  assert.doesNotMatch(source, /WhatsApp Cloud API error:.*JSON\.stringify\(data\)/);
  const route = endpoint('/whatsapp/order');
  assert.doesNotMatch(route, /ok\(res, result\);/);
  assert.match(route, /provider: 'whatsapp-cloud', status: 'provider_accepted', delivered: false/);
});

test('#854 endpoint preserves tenant boundary and does not persist a fake notification', () => {
  assert.match(source, /router\.use\(requireTenant\)/);
  const route = endpoint('/send');
  assert.doesNotMatch(route, /moduleRecord\.create|notificationLog\.create/);
  assert.match(route, /no se programó ningún envío/);
});
