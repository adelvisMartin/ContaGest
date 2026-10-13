// LAB-only pure slot parser. Untrusted message -> bounded, non-authoritative hint.
const TRACK = /^[\p{L}][\p{L}\p{N} '-]{1,79}$/u;
const RISK = /\b(?:carrera|apuesta|apostar|juega|jugada|consigue|monto|saldo|pagar|pago|cobrar|premio|dinero|resultado|llegada|cierre|cerrar|anula|cancelar|registrar|registra|ignora|instrucciones|sistema|admin|token|secret|otro|otra|hoy|ayer|manana|proxima|proximo|siguiente|anterior|misma|mismo|confirmar|confirma|ganador|cobro)\b/;
const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function validLabDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2100) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validLabTrack(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  return name.length >= 2 && name.length <= 80 && TRACK.test(name) &&
    !RISK.test(normalize(name)) ? name : null;
}

/**
 * Complete one or both of a previously requested race reference's slots.
 * Caller must validate pinned LAB identity, risk-safe classification,
 * stable same-sender context, TTL, and prior raceNumber.
 */
export function parseLabRaceSlotReply(text, prior = null) {
  const raw = String(text || '').trim();
  if (!prior || !Number.isInteger(prior.raceNumber) || prior.raceNumber < 1 ||
      prior.raceNumber > 99 || prior.raceScope || !raw ||
      raw.length > 140 || /[\n\r\[\]{};<>$\x60*]/.test(raw) ||
      RISK.test(normalize(raw))) return null;
  // "La sexta" (or "la quinta") is an ordinal RACE reference, not the
  // name of a racetrack. Never persist it into the partial track slot.
  if(/^(?:en\s+)?(?:la\s+)?(?:primera|segunda|tercera|cuarta|quinta|sexta|septima|octava|novena|decima)[.!?]?$/i.test(normalize(raw)))return null;
  const storedTrack = prior.raceTrack ? validLabTrack(prior.raceTrack) : null;
  const storedDate = prior.raceDate && validLabDate(prior.raceDate) ? prior.raceDate : null;
  const full = raw.match(/^(?:en\s+)?(?:(?:el\s+)?hip[oó]dromo\s+)?([\p{L}][\p{L}\p{N} '-]{1,79}?)\s+(?:el|fecha)\s+(\d{4}-\d{2}-\d{2})[.!?]?$/iu);
  if (full) {
    const racetrack = validLabTrack(full[1]);
    const raceDate = full[2];
    if (!racetrack || !validLabDate(raceDate) ||
        (storedTrack && normalize(storedTrack) !== normalize(racetrack)) ||
        (storedDate && storedDate !== raceDate)) return null;
    return { raceNumber: prior.raceNumber, racetrack, raceDate, complete: true };
  }
  const onlyDate = raw.match(/^(?:el\s+|fecha\s+)?(\d{4}-\d{2}-\d{2})[.!?]?$/iu);
  if (onlyDate) {
    const raceDate = onlyDate[1];
    if (!validLabDate(raceDate) || (storedDate && storedDate !== raceDate)) return null;
    return { raceNumber: prior.raceNumber, raceDate,
      ...(storedTrack ? { racetrack: storedTrack } : {}),
      complete: Boolean(storedTrack) };
  }
  // Without an explicit hipodromo prefix, only geographical forms such as
  // "La Rinconada" are accepted. Generic one-word replies fail closed.
  const prefixed = raw.match(/^(?:en\s+|(?:el\s+)?hip[oó]dromo\s+)([\p{L}][\p{L}\p{N} '-]{1,79})[.!?]?$/iu);
  const bare = /^(?:La|El|Los|Las)\s+[\p{L}][\p{L}\p{N} '-]{1,70}$/u.test(raw) ? raw : null;
  const racetrack = validLabTrack(prefixed?.[1] || bare);
  if (!racetrack || (storedTrack && normalize(storedTrack) !== normalize(racetrack))) return null;
  return { raceNumber: prior.raceNumber, racetrack,
    ...(storedDate ? { raceDate: storedDate } : {}), complete: Boolean(storedDate) };
}
