// Scope maintenance to the same backend origin and hipico Bridge route as ingest.
// This module never accesses a WhatsApp browser or sends a message.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export function labReplayPruneUrl(ingestUrl) {
  try {
    const url = new URL(String(ingestUrl || ''));
    if (!url.hostname || url.username || url.password || url.search || url.hash
      || !(url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname)))
      || !url.pathname.endsWith('/bridge/events')) return null;
    url.pathname = url.pathname.slice(0, -'/events'.length) + '/maintenance/lab-replay-prune';
    return url.href;
  } catch {
    return null;
  }
}

export function labReplayPruneDue({ backendSyncEnabled, lastAttemptAt, now, intervalMs = 60_000 }) {
  return backendSyncEnabled === true && Number.isFinite(now)
    && Number.isFinite(lastAttemptAt) && now - lastAttemptAt >= intervalMs;
}
