/**
 * #120: bind the PASS summary to the observed sample stream, not only its hash.
 * This pure validator does not authenticate physical observations: it detects
 * self-contradictory release evidence without weakening SOURCE/LAB isolation.
 */
const COUNTERS = ['decisions', 'duplicateResponses', 'lostDecisions', 'contextLeaks'];
const WHOLE = ['files', 'bytes', 'activeFiles', 'queuedFiles', 'failedFiles'];
const whole = value => Number.isSafeInteger(value) && value >= 0;
const finiteNonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function validSoakSampleSummary(rows, summary) {
  if (!Array.isArray(rows) || rows.length === 0 ||
      !summary || typeof summary !== 'object' || Array.isArray(summary) ||
      summary.samples !== rows.length) return false;

  let healthChecks = 0;
  let healthFailures = 0;
  let spoolAvailableChecks = 0;
  let maxSpoolBytes = 0;
  let maxBacklogAgeSeconds = 0;
  const prior = Object.fromEntries(COUNTERS.map(key => [key, -1]));

  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    for (const key of COUNTERS) {
      const value = row[key];
      if (!whole(value) || value < prior[key]) return false;
      prior[key] = value;
    }

    // The producer records exactly one health result per attempted probe and
    // null when health polling is disabled. Failures must never be hidden.
    if (row.health !== null) {
      const health = row.health;
      if (!health || typeof health !== 'object' || Array.isArray(health) ||
          typeof health.ok !== 'boolean' ||
          !Number.isInteger(health.status) || health.status < 0 || health.status > 599 ||
          !finiteNonnegative(health.latencyMs)) return false;
      // The real probe never reports healthy on HTTP 503/0, nor after a
      // SOURCE-write warning. A recomputed sample checksum is not proof
      // that a self-contradictory health object came from the producer.
      if((health.ok && (health.status<200 || health.status>=300 ||
          (health.reason!=null && health.reason!=='READY_SHADOW'))) ||
         (!health.ok && health.reason==='READY_SHADOW')) return false;
      healthChecks++;
      if (!health.ok) healthFailures++;
    }

    const spool = row.spool;
    if (!spool || typeof spool !== 'object' || Array.isArray(spool) ||
        typeof spool.available !== 'boolean' ||
        WHOLE.some(key => !whole(spool[key])) ||
        spool.activeFiles !== spool.queuedFiles + spool.failedFiles ||
        spool.files < spool.activeFiles ||
        !finiteNonnegative(spool.oldestAgeSeconds)) return false;
    if (spool.available) spoolAvailableChecks++;
    maxSpoolBytes = Math.max(maxSpoolBytes, spool.bytes);
    maxBacklogAgeSeconds = Math.max(maxBacklogAgeSeconds, spool.oldestAgeSeconds);
  }

  return summary.healthChecks === healthChecks &&
    summary.healthFailures === healthFailures &&
    summary.spoolChecks === rows.length &&
    summary.spoolAvailableChecks === spoolAvailableChecks &&
    summary.maxSpoolBytes === maxSpoolBytes &&
    finiteNonnegative(summary.maxBacklogAgeSeconds) &&
    Math.abs(summary.maxBacklogAgeSeconds - maxBacklogAgeSeconds) <= 1e-6 &&
    summary.unexpectedDuplicateResponses === prior.duplicateResponses &&
    summary.lostDecisions === prior.lostDecisions &&
    summary.contextLeaks === prior.contextLeaks;
}
