import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../backend/src/modules/notifications/notifications.routes.ts',import.meta.url),'utf8');
function endpoint(name){
  const start=source.indexOf("router.post('"+name+"'");
  assert.ok(start>=0);
  const end=source.indexOf('\n}));',start);
  assert.ok(end>start);
  return source.slice(start,end+5);
}
test('#854 generic /send refuses phantom queue with proper permission',()=>{
  const route=endpoint('/send');
  assert.match(route,/requirePermission\('sales\.manage'\)/);
  assert.match(route,/messageSchema\.parse\(req\.body \|\| \{\}\)/);
  assert.match(route,/throw new HttpError\(503,/);
  assert.doesNotMatch(route,/queued:\s*true|\bok\(res,|prisma\./);
});
test('#854 automated WhatsApp denies when no server-verified consent, no provider call',()=>{
  const route=endpoint('/whatsapp/order');
  assert.match(route,/requirePermission\('sales\.manage'\)/);
  assert.match(route,/whatsappOrderSchema\.parse\(req\.body \|\| \{\}\)/);
  assert.match(route,/throw new HttpError\(503,/);
  assert.doesNotMatch(route,/sendWhatsAppCloud|fetch\(|notificationLog\.create|queued:\s*true|delivered:\s*true/);
  assert.doesNotMatch(source,/fetch\(\s*\`https:\/\/graph\.facebook\.com/);
});
test('#854 delivery evidence is private read-only, no raw payload projection',()=>{
  assert.match(source,/router\.use\(requireTenant\)/);
  assert.match(source,/router\.get\('\/delivery-evidence', requirePermission\('sales\.manage'\)/);
  assert.match(source,/select: \{ id: true, tenantId: true, channel: true, status: true, createdAt: true \}/);
  assert.match(source,/private, no-store/);
  assert.doesNotMatch(endpoint('/whatsapp/order'),/payload:|recipient:|phone:.*order|moduleRecord/);
});
test('#854 payload validation and provider error do not reveal private details',()=>{
  assert.match(source,/const whatsappOrderSchema = z\.object\(/);
  assert.match(source,/message: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(4000\)/);
  assert.doesNotMatch(source,/JSON\.stringify\(data\)|WhatsApp Cloud API error:/);
  assert.match(source,/no está habilitado sin consentimiento verificable/);
});
