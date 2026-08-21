export const AUTOMATION_MODE = Object.freeze({
  MONITOR: 'monitor',
  ASSISTED: 'assisted',
  AUTO: 'auto',
  READ_ONLY: 'read_only'
});

export const HEALTH_LEVEL = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  BLOCKED: 'blocked'
});

const DEFAULT_LIMITS = Object.freeze({
  maxBacklog: 80,
  maxListenerLagMs: 30000,
  maxConsecutiveSendFailures: 3,
  maxReconnectsTenMin: 6,
  maxDuplicateRatio: 0.02,
  maxUnsafeEvents: 0
});

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function evaluateAutomationHealth(snapshot = {}, limits = DEFAULT_LIMITS) {
  const reasons = [];
  const backlog = number(snapshot.backlog);
  const listenerLagMs = number(snapshot.listenerLagMs);
  const sendFailures = number(snapshot.consecutiveSendFailures);
  const reconnectsTenMin = number(snapshot.reconnectsTenMin);
  const received = Math.max(0, number(snapshot.received));
  const duplicates = Math.max(0, number(snapshot.duplicates));
  const duplicateRatio = received ? duplicates / received : 0;
  const unsafeEvents = number(snapshot.unsafeEvents);
  const gapDetected = Boolean(snapshot.gapDetected);
  const sourceConnected = snapshot.sourceConnected !== false;
  const backendReachable = snapshot.backendReachable !== false;
  const reconciliationDifference = Math.abs(number(snapshot.reconciliationDifference));

  if (!sourceConnected) reasons.push('SOURCE_DISCONNECTED');
  if (gapDetected) reasons.push('MESSAGE_GAP');
  if (unsafeEvents > limits.maxUnsafeEvents) reasons.push('UNSAFE_EVENT');
  if (reconciliationDifference > 0) reasons.push('RECONCILIATION_DIFFERENCE');
  if (sendFailures >= limits.maxConsecutiveSendFailures) reasons.push('SEND_FAILURE_CIRCUIT');
  if (reconnectsTenMin > limits.maxReconnectsTenMin) reasons.push('RECONNECT_STORM');
  if (!backendReachable) reasons.push('BACKEND_UNREACHABLE');
  if (backlog > limits.maxBacklog) reasons.push('BACKLOG_HIGH');
  if (listenerLagMs > limits.maxListenerLagMs) reasons.push('LISTENER_LAG');
  if (duplicateRatio > limits.maxDuplicateRatio && duplicates >= 3) reasons.push('DUPLICATE_RATE_HIGH');

  const blocking = reasons.some((reason) => [
    'SOURCE_DISCONNECTED', 'MESSAGE_GAP', 'UNSAFE_EVENT', 'RECONCILIATION_DIFFERENCE',
    'SEND_FAILURE_CIRCUIT', 'RECONNECT_STORM'
  ].includes(reason));
  const degraded = reasons.length > 0;

  return {
    level: blocking ? HEALTH_LEVEL.BLOCKED : degraded ? HEALTH_LEVEL.DEGRADED : HEALTH_LEVEL.HEALTHY,
    mode: blocking ? AUTOMATION_MODE.READ_ONLY : degraded ? AUTOMATION_MODE.ASSISTED : (snapshot.requestedMode || AUTOMATION_MODE.ASSISTED),
    autoSendAllowed: !blocking && Boolean(snapshot.autoSendConfigured),
    reasons,
    metrics: { backlog, listenerLagMs, sendFailures, reconnectsTenMin, duplicateRatio, unsafeEvents, reconciliationDifference }
  };
}

export function shouldPublishAutomatically({ health, event, confidence = 0, monetary = false, trustedSource = false } = {}) {
  if (!health || health.level !== HEALTH_LEVEL.HEALTHY || !health.autoSendAllowed) {
    return { allowed: false, reason: 'HEALTH_GATE' };
  }
  if (!event || event.reviewRequired || event.status === 'late_or_next_block' || event.status === 'conflict') {
    return { allowed: false, reason: 'REVIEW_GATE' };
  }
  if (monetary && confidence < 0.995) return { allowed: false, reason: 'MONETARY_CONFIDENCE_GATE' };
  if (!monetary && confidence < 0.98) return { allowed: false, reason: 'CONFIDENCE_GATE' };
  if (['race_close', 'day_close', 'result'].includes(event.type) && !trustedSource) {
    return { allowed: false, reason: 'TRUSTED_SOURCE_GATE' };
  }
  return { allowed: true, reason: 'APPROVED' };
}

export function retryDelay(attempt, options = {}) {
  const baseMs = Math.max(250, number(options.baseMs, 1000));
  const capMs = Math.max(baseMs, number(options.capMs, 60000));
  const exp = Math.min(16, Math.max(0, Math.floor(number(attempt))));
  const deterministic = Math.min(capMs, baseMs * (2 ** exp));
  const jitter = options.jitter === false ? 1 : 0.85 + Math.random() * 0.3;
  return Math.round(deterministic * jitter);
}
