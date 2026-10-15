/**
 * #761: deterministic project time-window evidence, before any billing authority.
 * No DB reads, tenant inference, monetary mutation, approval or invoice posting.
 */
export const PROJECT_TIME_PERIOD_VERSION = 'project-time-period-v1';

const OFFSET_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export type ProjectTimePeriodInput = {
  tenantId: string;
  clientId: string;
  memberId: string;
  project: { id: string; tenantId: string; clientId: string };
  task?: { id: string; tenantId: string; projectId: string } | null;
  startedAt: string;
  endedAt: string;
  source: 'manual' | 'timer';
  recordedMinutes?: number;
};

function requireId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new TypeError('PROJECT_TIME_REFERENCE_INVALID');
  }
}

/** Requires a full explicit offset and a real calendar time; Date.parse alone rolls over invalid days. */
export function parseOffsetTimestamp(value: string): number {
  if (typeof value !== 'string') throw new TypeError('PROJECT_TIME_TIMESTAMP_INVALID');
  const match = OFFSET_TIMESTAMP.exec(value);
  if (!match) throw new TypeError('PROJECT_TIME_TIMESTAMP_INVALID');
  const [, year, month, day, hours, minutes, seconds, milli = '000', zone, sign, offsetH, offsetM] = match;
  const h = Number(hours), m = Number(minutes), s = Number(seconds), ms = Number(milli);
  const offsetHours = zone === 'Z' ? 0 : Number(offsetH);
  const offsetMinutes = zone === 'Z' ? 0 : Number(offsetM);
  if (h > 23 || m > 59 || s > 59 || offsetHours > 14 || offsetMinutes > 59 ||
      (offsetHours === 14 && offsetMinutes !== 0)) {
    throw new TypeError('PROJECT_TIME_TIMESTAMP_INVALID');
  }
  const offset = zone === 'Z' ? 0 : (sign === '+' ? 1 : -1) * (offsetHours * 60 + offsetMinutes);
  const localMillis = Date.UTC(Number(year), Number(month) - 1, Number(day), h, m, s, ms);
  const localDate = new Date(localMillis);
  if (!Number.isFinite(localMillis) ||
      localDate.getUTCFullYear() !== Number(year) ||
      localDate.getUTCMonth() + 1 !== Number(month) ||
      localDate.getUTCDate() !== Number(day) ||
      localDate.getUTCHours() !== h || localDate.getUTCMinutes() !== m ||
      localDate.getUTCSeconds() !== s || localDate.getUTCMilliseconds() !== ms) {
    throw new TypeError('PROJECT_TIME_TIMESTAMP_INVALID');
  }
  const instant = localMillis - offset * 60_000;
  if (!Number.isSafeInteger(instant)) throw new TypeError('PROJECT_TIME_TIMESTAMP_INVALID');
  return instant;
}

/**
 * Produces bounded, exact, tenant-linked time evidence. Call only after the
 * caller's authenticated context and project/task ownership are fetched from
 * the server-side database; this function does NOT authorize a request.
 */
export function normalizeProjectTimePeriod(input: ProjectTimePeriodInput) {
  if (!input || typeof input !== 'object') throw new TypeError('PROJECT_TIME_REFERENCE_INVALID');
  requireId(input.tenantId); requireId(input.clientId); requireId(input.memberId);
  requireId(input.project?.id); requireId(input.project?.tenantId);
  requireId(input.project?.clientId);
  if (input.project.tenantId !== input.tenantId || input.project.clientId !== input.clientId) {
    throw new TypeError('PROJECT_TIME_SCOPE_MISMATCH');
  }
  const task = input.task ?? null;
  if (task !== null) {
    requireId(task.id); requireId(task.tenantId); requireId(task.projectId);
    if (task.tenantId !== input.tenantId || task.projectId !== input.project.id) {
      throw new TypeError('PROJECT_TIME_SCOPE_MISMATCH');
    }
  }
  if (input.source !== 'manual' && input.source !== 'timer') {
    throw new TypeError('PROJECT_TIME_SOURCE_INVALID');
  }
  const start = parseOffsetTimestamp(input.startedAt);
  const end = parseOffsetTimestamp(input.endedAt);
  const millis = end - start;
  if (!Number.isSafeInteger(millis) || millis <= 0 || millis > 24 * 60 * 60_000 ||
      millis % 60_000 !== 0) {
    throw new TypeError('PROJECT_TIME_DURATION_INVALID');
  }
  const durationMinutes = millis / 60_000;
  if (input.recordedMinutes !== undefined &&
      (!Number.isSafeInteger(input.recordedMinutes) || input.recordedMinutes !== durationMinutes)) {
    throw new TypeError('PROJECT_TIME_DURATION_MISMATCH');
  }
  return Object.freeze({
    version: PROJECT_TIME_PERIOD_VERSION,
    tenantId: input.tenantId,
    clientId: input.clientId,
    memberId: input.memberId,
    projectId: input.project.id,
    taskId: task?.id ?? null,
    source: input.source,
    startedAtUtc: new Date(start).toISOString(),
    endedAtUtc: new Date(end).toISOString(),
    durationMinutes,
    billableAuthorized: false as const,
    invoiceAuthorized: false as const
  });
}
