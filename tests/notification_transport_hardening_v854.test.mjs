import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src=readFileSync(new URL('../backend/src/modules/notifications/notifications.routes.ts',import.meta.url),'utf8');
test('#854 legacy WhatsApp transport accepts bounded shape but never sends without consent',()=>{
  assert.match(src,/const whatsappOrderSchema = z\.object\(/);
  assert.match(src,/phone: z\.string\(\)\.regex\(/);
  assert.match(src,/\}\)\.strip\(\)/);
  assert.match(src,/\}\)\.strict\(\)/);
  assert.match(src,/whatsappOrderSchema\.parse\(req\.body \|\| \{\}\)/);
  const handler=src.split("router.post('/whatsapp/order'")[1]?.split('\n}));')[0];
  assert.ok(handler);
  assert.match(handler,/throw new HttpError\(503,/);
  assert.doesNotMatch(handler,/fetch\(|notificationLog\.create\(|sendWhatsAppCloud\(/);
});
test('#854 provider secrets and unverified messages never leave the server',()=>{
  assert.doesNotMatch(src,/WHATSAPP_CLOUD_TOKEN|WHATSAPP_PHONE_NUMBER_ID|WHATSAPP_GRAPH_VERSION/);
  assert.doesNotMatch(src,/graph\.facebook\.com|Authorization:\s*\`Bearer/);
  assert.match(src,/select: \{ id: true, tenantId: true, channel: true, status: true, createdAt: true \}/);
  assert.match(src,/private, no-store/);
});
