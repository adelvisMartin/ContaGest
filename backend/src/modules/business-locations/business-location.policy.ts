import { HttpError } from '../../shared/http.js';

export const BUSINESS_LOCATION_STATUSES = ['active','inactive','closed'] as const;
export type BusinessLocationStatus = typeof BUSINESS_LOCATION_STATUSES[number];

export function normalizeBusinessLocationCode(value: unknown): string {
  const code=String(value ?? '').trim().toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(code)) {
    throw new HttpError(400,'El código de sede debe usar 1-32 caracteres A-Z, 0-9, _ o -.',{code:'BUSINESS_LOCATION_CODE_INVALID'});
  }
  return code;
}

export function assertIanaTimezone(value: unknown): string {
  const timezone=String(value ?? '').trim();
  if(!timezone) throw new HttpError(400,'La zona horaria IANA es obligatoria.',{code:'BUSINESS_LOCATION_TIMEZONE_REQUIRED'});
  try { new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(new Date()); }
  catch { throw new HttpError(400,'Zona horaria IANA inválida.',{code:'BUSINESS_LOCATION_TIMEZONE_INVALID'}); }
  return timezone;
}

export function normalizeOptionalContact(value: unknown, max=160): string | null {
  const normalized=String(value ?? '').trim();
  if(!normalized) return null;
  if(normalized.length>max) throw new HttpError(400,'El dato de contacto excede el máximo permitido.',{code:'BUSINESS_LOCATION_CONTACT_INVALID'});
  return normalized;
}
