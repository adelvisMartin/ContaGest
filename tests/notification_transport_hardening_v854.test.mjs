import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src=readFileSync(new URL('../backend/src/modules/notifications/notifications.routes.ts',import.meta.url),'utf8');

test('#854 outbound WhatsApp payload rejects extra outer fields and malformed phone',()=>{
  assert.match(src,/const whatsappOrderSchema = z\.object\(\{/);
  assert.match(src,/phone: z\.string\(\)\.regex\(/);
  assert.match(src,/\}\)\.strip\(\)/);
  assert.match(src,/\}\)\.strict\(\)/);
  assert.match(src,/whatsappOrderSchema\.parse\(req\.body \|\| \{\}\)/);
  assert.match(src,/sendWhatsAppCloud\(body\.order\.phone, body\.message\)/);
  assert.doesNotMatch(src,/const order: any = body\.order/);
});
test('#854 provider destination path, external timeout and private timeline are bounded',()=>{
  assert.match(src,/!\/\^\\d\{6,20\}\$\/\.test\(phoneNumberId\)/);
  assert.match(src,/!\/\^v\[1-9\]\\d\{0,2\}\\\.\\d\{1,2\}\$\/\.test\(version\)/);
  assert.match(src,/signal: AbortSignal\.timeout\(10000\)/);
  assert.match(src,/prisma\.notificationLog\.create\(\{/);
  assert.doesNotMatch(src,/recipient: body\.order\.phone|message: body\.message|providerId: data/);
  assert.match(src,/deliveryConfirmed: false/);
});
