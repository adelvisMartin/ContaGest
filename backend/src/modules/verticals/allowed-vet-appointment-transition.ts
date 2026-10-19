/** #812: legal predecessors for one appointment status transition.
 * A terminal appointment is never silently reopened through status PATCH. */
export type VetAppointmentStatus =
  'scheduled'|'confirmed'|'checked_in'|'in_progress'|'completed'|'cancelled'|'no_show';

const PREVIOUS: Record<VetAppointmentStatus, readonly VetAppointmentStatus[]> = {
  scheduled:['scheduled'],
  confirmed:['scheduled','confirmed'],
  checked_in:['scheduled','confirmed','checked_in'],
  in_progress:['checked_in','in_progress'],
  completed:['in_progress'],
  cancelled:['scheduled','confirmed','checked_in','in_progress'],
  no_show:['scheduled','confirmed']
};

export function allowedVetAppointmentPreviousStatuses(next: VetAppointmentStatus): readonly VetAppointmentStatus[] {
  if (!Object.prototype.hasOwnProperty.call(PREVIOUS,next)) return [];
  return PREVIOUS[next];
}

export function allowedVetAppointmentTransition(current: VetAppointmentStatus, next: VetAppointmentStatus): boolean {
  return allowedVetAppointmentPreviousStatuses(next).includes(current);
}
