import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const routes=readFileSync(new URL('../backend/src/modules/notifications/notifications.routes.ts',import.meta.url),'utf8');
test('#854 in-app preferences mutate only the authenticated self tenant/user',()=>{
  assert.match(routes,/router\.get\('\/preferences\/me'/);
  assert.match(routes,/router\.put\('\/preferences\/me'/);
  assert.match(routes,/const \{tenantId,userId\}=authenticatedSelf\(req\)/);
  assert.match(routes,/channel:'in_app'/);
  assert.match(routes,/where:\{id:userId,tenantId,status:'active'\}/);
  assert.match(routes,/prisma\.\$transaction\(async tx=>/);
  assert.match(routes,/tx\.auditLog\.create\(/);
  assert.doesNotMatch(routes,/channel:input\.channel|tenantId:input\.tenantId|userId:input\.userId/);
});
test('#854 consent is explicit and quiet-hours time zone is IANA validated',()=>{
  assert.match(routes,/preferenceSchema=z\.object\(/);
  assert.match(routes,/enabled:z\.boolean\(\)/);
  assert.match(routes,/consent:z\.enum\(\['granted','denied'\]\)/);
  assert.match(routes,/input\.quietHours\.timeZone/);
  assert.match(routes,/new Intl\.DateTimeFormat\('en-US',/);
  assert.match(routes,/verifiedSource:input\.consent==='granted'\?'authenticated-self-service':null/);
  assert.match(routes,/private, no-store/);
});
test('#854 no external provider or dispatch is authorized by preference endpoint',()=>{
  const handler=routes.split("router.put('/preferences/me'")[1].split("// Tenant-scoped, permission-guarded PREVIEW ONLY")[0];
  assert.doesNotMatch(handler,/sendWhatsAppCloud|fetch\(|notificationLog\.create|queued:true|delivered:true/);
  assert.match(routes,/throw new HttpError\(503, 'El envío automático de WhatsApp no está habilitado/);
});
