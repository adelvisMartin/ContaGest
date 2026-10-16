/**
 * Veterinary immunization date boundary. Clinical timestamps must carry an
 * explicit offset: a local wall-clock without timezone is not an instant.
 * Existing persisted events are never reinterpreted by this read-free policy.
 */
export type ImmunizationDateField = 'administeredAt' | 'nextDueAt';
export type ImmunizationDateIssue = { field: ImmunizationDateField; message: string };

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

export function parseImmunizationInstant(value: string): number | null {
  const parts = INSTANT.exec(value);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  const zone = parts[7];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (zone !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  }
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : null;
}

export function immunizationDateIssues(dates: {
  administeredAt?: string;
  nextDueAt?: string | null;
}): ImmunizationDateIssue[] {
  const errors: ImmunizationDateIssue[] = [];
  const administration = dates.administeredAt === undefined ? null : parseImmunizationInstant(dates.administeredAt);
  const due = dates.nextDueAt === undefined || dates.nextDueAt === null
    ? null : parseImmunizationInstant(dates.nextDueAt);
  if (dates.administeredAt !== undefined && administration === null) {
    errors.push({ field: 'administeredAt', message: 'La fecha de administración debe ser ISO 8601 con zona horaria explícita.' });
  }
  if (dates.nextDueAt !== undefined && dates.nextDueAt !== null && due === null) {
    errors.push({ field: 'nextDueAt', message: 'La fecha próxima debe ser ISO 8601 con zona horaria explícita.' });
  }
  if (administration !== null && due !== null && due <= administration) {
    errors.push({ field: 'nextDueAt', message: 'La próxima dosis debe ser posterior a la administración.' });
  }
  return errors;
}
