/**
 * #854: operator delivery timeline from the existing NotificationLog model.
 * Stored "delivered" is a claim until a verified #772 provider receipt exists.
 * Never project recipient, message, subject, provider ID, error or payload.
 */
export type NotificationLogMetadata = Readonly<{
  id: string; tenantId: string; channel: string;
  status: string; createdAt: Date;
}>;
const STATES = new Set(['queued','pending','scheduled','sending','provider_accepted','provider_unverified','delivered','failed_retryable','failed_permanent','failed','skipped','suppressed','cancelled']);
const CHANNELS = new Set(['in_app','email','web_push','whatsapp','sms']);
function denied():never { throw new Error('NOTIFICATION_TIMELINE_EVIDENCE_INVALID'); }
export function projectNotificationDeliveryEvidence(
  tenantId: string, rows: readonly NotificationLogMetadata[],
) {
  if (typeof tenantId !== 'string' || !tenantId.trim() ||
      !Array.isArray(rows) || rows.length > 100) denied();
  const seen = new Set<string>();
  const records = rows.map(row => {
    if (!row || row.tenantId !== tenantId ||
        typeof row.id !== 'string' || !row.id.trim() || seen.has(row.id) ||
        typeof row.channel !== 'string' || !CHANNELS.has(row.channel) ||
        typeof row.status !== 'string' || !STATES.has(row.status) ||
        !(row.createdAt instanceof Date) || !Number.isFinite(row.createdAt.getTime())) denied();
    seen.add(row.id);
    return Object.freeze({
      id: row.id, channel: row.channel, stateRecorded: row.status,
      createdAt: row.createdAt.toISOString(),
      // HTTP accepted/queued and legacy "delivered" are NOT proof of receipt.
      receiptVerified: false as const,
      deliveryEvidence: 'NOT_VERIFIED' as const,
    });
  });
  return Object.freeze({
    tenantId, records: Object.freeze(records),
    totalFetched: records.length,
    verifiedDeliveries: 0,
    mode: 'READ_ONLY_UNVERIFIED_TIMELINE' as const,
  });
}
