/**
 * #1011 - independent fail-closed SOURCE read eligibility.
 *
 * Consumer WhatsApp Messenger has no verified authorization for automated
 * access to the real private group. This decision is independent of whether
 * send, shadow, backfill, diagnostic, or LAB reply flags are enabled.
 * Changing it requires a separate official policy/capability review.
 */
export const SOURCE_AUTO_READ_POLICY_NO_GO = 'SOURCE_AUTO_READ_POLICY_NO_GO';

export function sourceReadPolicyStatus() {
  return Object.freeze({
    eligible: false,
    status: 'NO_GO',
    policyCode: SOURCE_AUTO_READ_POLICY_NO_GO,
    reason: 'MESSENGER_AUTOMATED_GROUP_READ_NOT_AUTHORIZED',
    environmentOverrideAllowed: false
  });
}

/**
 * Invoke at entrypoint module evaluation, BEFORE mkdir/profile/session/spool,
 * Chromium/Edge launch, network access, or any group message processing.
 * This does not block standalone, synthetic offline LAB unit tests.
 */
export function assertSourceAutoReadDenied() {
  const error = new Error(SOURCE_AUTO_READ_POLICY_NO_GO);
  error.code = SOURCE_AUTO_READ_POLICY_NO_GO;
  throw error;
}
