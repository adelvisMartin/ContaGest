import { HttpError } from '../http.js';

const SOURCE_PATTERN = /^[a-z0-9][a-z0-9._:-]{1,79}$/;

export function normalizeInventoryReservationOwner(input: { source: string; sourceId: string }) {
  const source = String(input?.source || '').trim().toLowerCase();
  const sourceId = String(input?.sourceId || '').trim();

  if (!SOURCE_PATTERN.test(source)) {
    throw new HttpError(400, 'Origen de reserva de inventario inválido.', { code: 'INVENTORY_RESERVATION_SOURCE_INVALID' });
  }
  if (!sourceId || sourceId.length > 120) {
    throw new HttpError(400, 'Identificador de origen de reserva inválido.', { code: 'INVENTORY_RESERVATION_SOURCE_ID_INVALID' });
  }

  return Object.freeze({ source, sourceId });
}
