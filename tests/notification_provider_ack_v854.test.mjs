import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyWhatsAppProviderAck} from '../backend/src/modules/notifications/notification-provider-ack.mjs';
const good={messages:[{id:'wamid.Message_ABC12345'}],contacts:[{wa_id:'123456789'}],secret:'do-not-retain'};
test('200 with genuine message identity means provider accepted only',()=>{const r=classifyWhatsAppProviderAck(true,good);assert.deepEqual(r,{status:'provider_accepted',providerAccepted:true,deliveryConfirmed:false});assert.ok(Object.isFrozen(r));});
test('200 with empty result is not delivery nor provider acceptance',()=>{for(const v of [null,{},[],{messages:[]},{messages:[{}]},{messages:[{id:''}]}])assert.equal(classifyWhatsAppProviderAck(true,v).status,'provider_unverified');});
test('non-success HTTP may not be accepted despite body',()=>assert.equal(classifyWhatsAppProviderAck(false,good).status,'provider_unverified'));
test('multiple ambiguous messages fail closed',()=>assert.equal(classifyWhatsAppProviderAck(true,{messages:[good.messages[0],good.messages[0]]}).providerAccepted,false));
test('invalid provider id never accepted',()=>{for(const id of ['x','abc xyz','***','a'.repeat(257),{},null])assert.equal(classifyWhatsAppProviderAck(true,{messages:[{id}]}).providerAccepted,false)});
test('provider payload PII, id, and arbitrary data never copied',()=>{const r=classifyWhatsAppProviderAck(true,good);const s=JSON.stringify(r);for(const term of ['wamid.','123456789','do-not-retain'])assert.ok(!s.includes(term));});
const route=readFileSync(new URL('../backend/src/modules/notifications/notifications.routes.ts',import.meta.url),'utf8');
test('provider acknowledgements remain pure; no live adapter is wired without consent',()=>{
  assert.doesNotMatch(route,/classifyWhatsAppProviderAck\(response\.ok,data\)/);
  assert.doesNotMatch(route,/graph\.facebook\.com|WHATSAPP_CLOUD_TOKEN/);
  assert.match(route,/no está habilitado sin consentimiento verificable/);
});
test('legacy statuses remain read-only evidence, no new unverified provider side effect',()=>{
  assert.match(route,/projectNotificationDeliveryEvidence/);
  assert.match(route,/notificationLog\.findMany\(/);
  assert.doesNotMatch(route,/notificationLog\.create\(/);
});
test('generic and WhatsApp routes remain fail-closed',()=>{
  assert.match(route,/throw new HttpError\(503, 'La cola de notificaciones no está disponible/);
  assert.match(route,/throw new HttpError\(503, 'El envío automático de WhatsApp no está habilitado/);
});
