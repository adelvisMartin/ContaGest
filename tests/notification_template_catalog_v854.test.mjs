import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NotificationTemplateError,
  notificationTemplateKeys,
  renderNotificationTemplate,
  evaluateNotificationQuietHours
} from '../backend/src/modules/notifications/notification-template-catalog.ts';

const values = { title: 'Caja', detail: 'Operación registrada' };

test('template catalog version and locale fallback are deterministic', () => {
  assert.deepEqual(notificationTemplateKeys(), ['operational.notice', 'sales.order-status']);
  assert.deepEqual(renderNotificationTemplate('operational.notice', 'fr-FR', values), {
    key: 'operational.notice', version: 1, locale: 'es-VE', classification: 'optional',
    subject: 'Aviso: Caja', body: 'Operación registrada', deliveryScheduled: false
  });
  assert.equal(renderNotificationTemplate('operational.notice', 'en-US', values).subject, 'Notice: Caja');
  assert.equal(renderNotificationTemplate('sales.order-status', 'es-VE', {orderRef:'SO-4',stateLabel:'Listo'}).body,
    'El pedido SO-4 está en estado Listo.');
});

test('template previews escape injected HTML and never send or schedule', () => {
  const r = renderNotificationTemplate('operational.notice', 'es-VE', {
    title: '<svg onload="a()">', detail: '& <script>alert(1)</script> ' + "'ok'"
  });
  assert.match(r.subject, /&lt;svg/);
  assert.doesNotMatch(r.subject, /<svg/);
  assert.match(r.body, /&lt;script&gt;/);
  assert.match(r.body, /&amp;/);
  assert.match(r.body, /&#39;ok&#39;/);
  assert.equal(r.deliveryScheduled, false);
});

test('template preview rejects mass-assignment, empty or unknown variables', () => {
  for (const data of [null, [], {}, {title:'a'}, {...values, tenantId:'OTHER'},
    { ...values, title: '' }, { ...values, title: 'X'.repeat(161) },
    { ...values, detail: 'line\nbreak' }, { ...values, detail: null }]) {
    assert.throws(() => renderNotificationTemplate('operational.notice', 'es-VE', data), NotificationTemplateError);
  }
  assert.throws(() => renderNotificationTemplate('__proto__', 'es-VE', values), NotificationTemplateError);
  assert.throws(() => renderNotificationTemplate('constructor', 'es-VE', values), NotificationTemplateError);
});

test('quiet hours boundaries in America/Caracas and daytime intervals', () => {
  const input = (iso, start='22:00', end='07:00') => evaluateNotificationQuietHours({
    instant: new Date(iso), timeZone: 'America/Caracas', start, end
  });
  assert.deepEqual(input('2026-10-15T02:00:00.000Z'), {deferred:true,localTime:'22:00',timeZone:'America/Caracas'});
  assert.equal(input('2026-10-15T10:59:00.000Z').deferred, true);
  assert.equal(input('2026-10-15T11:00:00.000Z').deferred, false);
  assert.equal(input('2026-10-15T13:00:00.000Z','09:00','17:00').deferred, true);
  assert.equal(input('2026-10-15T21:00:00.000Z','09:00','17:00').deferred, false);
});

test('DST spring missing times and fall repeated hour cannot bypass quiet hours', () => {
  const input = (iso) => evaluateNotificationQuietHours({
    instant:new Date(iso),timeZone:'America/New_York',start:'01:00',end:'03:00'
  });
  assert.equal(input('2026-11-01T05:30:00.000Z').deferred, true);
  assert.equal(input('2026-11-01T06:30:00.000Z').deferred, true);
  assert.equal(input('2026-03-08T07:00:00.000Z').deferred, false);
});

test('quiet hours reject invalid zone, invalid instant, equal or ambiguous endpoints', () => {
  const good={instant:new Date('2026-10-15T00:00:00Z'),timeZone:'America/Caracas',start:'22:00',end:'07:00'};
  for (const bad of [{timeZone:'Mars/Caracas'}, {start:'25:00'}, {end:'invalid'},
    {instant:new Date('bad')}, {start:'07:00',end:'07:00'}]) {
    assert.throws(() => evaluateNotificationQuietHours({...good,...bad}), NotificationTemplateError);
  }
});

const routerSource = readFileSync(new URL('../backend/src/modules/notifications/notifications.routes.ts', import.meta.url), 'utf8');

test('template preview is tenant-scoped and permission guarded', () => {
  assert.match(routerSource, /router\.use\(requireTenant\)/);
  assert.match(routerSource, /router\.post\('\/templates\/preview', requirePermission\('sales\.manage'\)/);
  assert.match(routerSource, /previewSchema\.parse\(req\.body \|\| \{\}\)/);
  assert.match(routerSource, /previewSchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/);
});

test('template preview never persists, sends or promises delivery', () => {
  const start=routerSource.indexOf("router.post('/templates/preview'");
  const end=routerSource.indexOf('\n}));', start);
  assert.ok(start>=0 && end>start);
  const body=routerSource.slice(start,end);
  assert.match(body, /renderNotificationTemplate/);
  assert.match(body, /evaluateNotificationQuietHours/);
  assert.match(body, /queued: false, delivered: false/);
  assert.doesNotMatch(body, /sendWhatsAppCloud|notificationLog\.create|moduleRecord\.create|fetch\(|queued:\s*true/);
  assert.match(body, /new HttpError\(422, error\.message\)/);
});
