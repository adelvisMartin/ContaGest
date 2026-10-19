// A directory entry or a caller-supplied license number is not a verified
// clinical signing authority. Human encounter signatures are issued only by
// their dedicated review/discharge workflows, never by generic creation.
export function generalEncounterCreationError({ patientKind, type, status }) {
  if (type === 'ambulatory-visit') {
    return 'La consulta ambulatoria debe iniciarse desde la cita y su flujo clínico.';
  }
  if (patientKind === 'human' && status !== 'draft') {
    return 'La historia clínica humana debe crearse como borrador y firmarse mediante el flujo autorizado.';
  }
  return null;
}
