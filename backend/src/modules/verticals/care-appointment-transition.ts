import { HttpError } from '../../shared/http.js';

const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  waitlisted: ['scheduled', 'cancelled'],
  scheduled: ['confirmed', 'checked_in', 'cancelled', 'no_show', 'waitlisted'],
  confirmed: ['scheduled', 'checked_in', 'cancelled', 'no_show'],
  checked_in: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  no_show: []
};

export function assertCareAppointmentTransition(before: string, after: string): void {
  if (!(before in ALLOWED) || !(after in ALLOWED)) {
    throw new HttpError(422, 'Estado de cita desconocido.');
  }
  if (before !== after && !ALLOWED[before].includes(after)) {
    throw new HttpError(409, 'Transición de cita no permitida.');
  }
}

// Generic rescheduling cannot impersonate reception, clinical start, or discharge.
export function assertCareAppointmentPatchTransition(before: string, after: string): void {
  assertCareAppointmentTransition(before, after);
  if (['checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'].includes(before) ||
      ['checked_in', 'in_progress', 'completed'].includes(after)) {
    throw new HttpError(409, 'Esta transición requiere el flujo ambulatorio autorizado.');
  }
}
