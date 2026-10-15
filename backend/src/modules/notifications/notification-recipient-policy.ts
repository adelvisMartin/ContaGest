/**
 * #854: deterministic, provider-neutral notification eligibility checks.
 * Trust boundary: caller MUST supply tenant/recipient/preference evidence from
 * authenticated server-side persistence, never fields from a browser request.
 * This module has no side effects, never queues or sends messages.
 */
import { evaluateNotificationQuietHours, NotificationTemplateError } from './notification-template-catalog.js';

export type NotificationPolicyChannel = 'in_app' | 'email' | 'web_push' | 'whatsapp';
export type NotificationConsent = 'granted' | 'denied' | 'unknown';
export type NotificationPolicyDecision = 'SUPPRESS' | 'DEFER' | 'ELIGIBLE_FOR_INTENT';

export type ServerVerifiedNotificationPolicy = Readonly<{
  requestTenantId: string;
  recipientTenantId: string;
  recipientActive: boolean;
  channel: NotificationPolicyChannel;
  channelEnabled: boolean;
  consent: NotificationConsent;
  consentVerifiedByServer: boolean;
  preferenceEnabled: boolean;
  templateClass: 'optional' | 'transactional';
  instant: Date;
  quietHours?: Readonly<{ timeZone: string; start: string; end: string }>;
}>;

export type NotificationPolicyResult = Readonly<{
  decision: NotificationPolicyDecision;
  reason: string;
  deliveryAuthorized: false;
  queued: false;
}>;

function result(decision: NotificationPolicyDecision, reason: string): NotificationPolicyResult {
  return Object.freeze({ decision, reason, deliveryAuthorized: false, queued: false });
}

function isTenantKey(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

/**
 * Fail closed if there is insufficient authority to enqueue an intent. Even an
 * ELIGIBLE_FOR_INTENT result is NOT permission to dispatch via a provider.
 * Outbox #853 and per-channel adapter/receipt #772 remain independent gates.
 */
export function evaluateNotificationRecipientPolicy(
  evidence: ServerVerifiedNotificationPolicy | null | undefined
): NotificationPolicyResult {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return result('SUPPRESS', 'MISSING_SERVER_EVIDENCE');
  }
  if (!isTenantKey(evidence.requestTenantId) || !isTenantKey(evidence.recipientTenantId) ||
      evidence.requestTenantId !== evidence.recipientTenantId) {
    return result('SUPPRESS', 'RECIPIENT_TENANT_MISMATCH');
  }
  if (evidence.recipientActive !== true) return result('SUPPRESS', 'RECIPIENT_INACTIVE');
  if (!['in_app', 'email', 'web_push', 'whatsapp'].includes(evidence.channel)) {
    return result('SUPPRESS', 'UNKNOWN_CHANNEL');
  }
  if (evidence.channelEnabled !== true) return result('SUPPRESS', 'CHANNEL_DISABLED');
  if (evidence.templateClass !== 'optional' && evidence.templateClass !== 'transactional') {
    return result('SUPPRESS', 'UNKNOWN_TEMPLATE_CLASS');
  }
  if (evidence.consentVerifiedByServer !== true || evidence.consent !== 'granted') {
    return result('SUPPRESS', 'CONSENT_NOT_VERIFIED');
  }
  // The transactional label alone never overrides channel consent or opt-out.
  if (evidence.preferenceEnabled !== true) return result('SUPPRESS', 'RECIPIENT_OPTED_OUT');
  // External provider authorization requires the independent #772 policy gate.
  // In particular, no ERP preference can authorize Hípico SOURCE WhatsApp.
  if (evidence.channel !== 'in_app') return result('SUPPRESS', 'PROVIDER_POLICY_NOT_VERIFIED');
  if (!(evidence.instant instanceof Date) || !Number.isFinite(evidence.instant.valueOf())) {
    return result('SUPPRESS', 'INVALID_INSTANT');
  }
  if (evidence.quietHours) {
    try {
      const q = evaluateNotificationQuietHours({
        instant: evidence.instant,
        timeZone: evidence.quietHours.timeZone,
        start: evidence.quietHours.start,
        end: evidence.quietHours.end
      });
      if (q.deferred) return result('DEFER', 'QUIET_HOURS');
    } catch (error) {
      if (error instanceof NotificationTemplateError) return result('SUPPRESS', 'INVALID_QUIET_HOURS');
      throw error;
    }
  }
  return result('ELIGIBLE_FOR_INTENT', 'POLICY_CHECKED_NO_DISPATCH');
}
