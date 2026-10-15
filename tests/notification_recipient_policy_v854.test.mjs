import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNotificationRecipientPolicy } from '../backend/src/modules/notifications/notification-recipient-policy.ts';

const baseline = Object.freeze({
  requestTenantId: 'tenant-A', recipientTenantId: 'tenant-A', recipientActive: true,
  channel: 'in_app', channelEnabled: true, consent: 'granted',
  consentVerifiedByServer: true, preferenceEnabled: true,
  templateClass: 'transactional', instant: new Date('2026-10-15T17:00:00.000Z')
});
const decision = (update = {}) => evaluateNotificationRecipientPolicy({ ...baseline, ...update });

test('#854: verified intra-tenant in-app preference permits only an intent, never delivery', () => {
  assert.deepEqual(decision(), {
    decision: 'ELIGIBLE_FOR_INTENT', reason: 'POLICY_CHECKED_NO_DISPATCH',
    deliveryAuthorized: false, queued: false
  });
});

test('#854: missing evidence and cross-tenant recipient fail closed', () => {
  assert.equal(evaluateNotificationRecipientPolicy(null).decision, 'SUPPRESS');
  assert.equal(evaluateNotificationRecipientPolicy(undefined).decision, 'SUPPRESS');
  assert.equal(decision({ recipientTenantId: 'tenant-B' }).reason, 'RECIPIENT_TENANT_MISMATCH');
  assert.equal(decision({ requestTenantId: '' }).decision, 'SUPPRESS');
  assert.equal(decision({ recipientActive: false }).reason, 'RECIPIENT_INACTIVE');
});

test('#854: no channel or marketing/transactional label bypasses consent', () => {
  for (const templateClass of ['optional', 'transactional']) {
    for (const consent of ['unknown', 'denied', 'granted']) {
      const status = decision({ templateClass, consent, consentVerifiedByServer: false });
      assert.equal(status.reason, 'CONSENT_NOT_VERIFIED');
    }
    assert.equal(decision({ templateClass, consent: 'denied' }).decision, 'SUPPRESS');
    assert.equal(decision({ templateClass, preferenceEnabled: false }).reason, 'RECIPIENT_OPTED_OUT');
  }
});

test('#854: external channels never acquire implicit provider or WhatsApp SOURCE approval', () => {
  for (const channel of ['email', 'web_push', 'whatsapp']) {
    const res = decision({ channel });
    assert.equal(res.reason, 'PROVIDER_POLICY_NOT_VERIFIED');
    assert.equal(res.deliveryAuthorized, false);
  }
  assert.equal(decision({ channelEnabled: false }).reason, 'CHANNEL_DISABLED');
  assert.equal(decision({ channel: 'unknown' }).reason, 'UNKNOWN_CHANNEL');
});

test('#854: quiet hours defer even a transactional notice; unverified schedule suppresses', () => {
  const quietHours = { timeZone: 'America/Caracas', start: '22:00', end: '07:00' };
  assert.equal(decision({ instant: new Date('2026-10-15T02:00:00Z'), quietHours }).decision, 'DEFER');
  assert.equal(decision({ instant: new Date('2026-10-15T11:00:00Z'), quietHours }).decision, 'ELIGIBLE_FOR_INTENT');
  assert.equal(decision({ quietHours: { ...quietHours, timeZone: 'Invalid/TZ' } }).reason, 'INVALID_QUIET_HOURS');
  assert.equal(decision({ instant: new Date('invalid') }).reason, 'INVALID_INSTANT');
});

test('#854: unknown template class or malformed evidence suppresses and never emits PII', () => {
  assert.equal(decision({ templateClass: 'critical-bypass' }).reason, 'UNKNOWN_TEMPLATE_CLASS');
  assert.equal(evaluateNotificationRecipientPolicy([]).decision, 'SUPPRESS');
  const privateTenant='SECRET_TENANT_ID';
  assert.equal(JSON.stringify(decision({ recipientTenantId: privateTenant })).includes(privateTenant), false);
});
