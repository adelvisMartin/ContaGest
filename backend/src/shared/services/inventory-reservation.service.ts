import type { Prisma } from '@prisma/client';
import { HttpError } from '../http.js';
import { compare, subtract, ZERO } from '../financial/decimal.js';
import {
  applyInventoryStandardEffect,
  lockInventoryProduct
} from './inventory-movement.service.js';

const SOURCE_PATTERN = /^[a-z0-9][a-z0-9._:-]{1,79}$/;

export type InventoryReservationOwner = Readonly<{
  source: string;
  sourceId: string;
}>;

type ReservationMutationInput = {
  tenantId: string;
  productId: string;
  amount: Prisma.Decimal;
  owner: InventoryReservationOwner;
  unitCost?: Prisma.Decimal | null;
  note?: string | null;
};

export function normalizeInventoryReservationOwner(input: { source: string; sourceId: string }): InventoryReservationOwner {
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

export async function inventoryReservationOutstanding(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; productId: string; source: string; sourceId: string }
) {
  const owner = normalizeInventoryReservationOwner(input);
  const where = {
    tenantId: input.tenantId,
    productId: input.productId,
    source: owner.source,
    sourceId: owner.sourceId
  } as const;

  const reservations = await tx.inventoryMovement.aggregate({
    where: { ...where, type: 'reservation' },
    _sum: { quantity: true }
  });
  const releases = await tx.inventoryMovement.aggregate({
    where: { ...where, type: 'release' },
    _sum: { quantity: true }
  });

  const outstanding = subtract(reservations._sum.quantity ?? ZERO, releases._sum.quantity ?? ZERO);
  if (compare(outstanding, ZERO) < 0) {
    throw new HttpError(409, 'La reserva derivada del owner quedó en saldo negativo.', {
      code: 'INVENTORY_RESERVATION_LEDGER_INVALID'
    });
  }
  return outstanding;
}

export async function reserveInventoryForOwner(
  tx: Prisma.TransactionClient,
  input: ReservationMutationInput
) {
  const owner = normalizeInventoryReservationOwner(input.owner);
  const product = await lockInventoryProduct(tx, input.tenantId, input.productId);
  const updated = await applyInventoryStandardEffect(tx, product, 'reservation', input.amount);
  const movement = await tx.inventoryMovement.create({
    data: {
      tenantId: input.tenantId,
      productId: product.id,
      type: 'reservation',
      quantity: input.amount,
      unitCost: input.unitCost ?? null,
      source: owner.source,
      sourceId: owner.sourceId,
      note: input.note ?? null
    }
  });
  return { movement, product: updated };
}

export async function releaseInventoryReservationForOwner(
  tx: Prisma.TransactionClient,
  input: ReservationMutationInput
) {
  const owner = normalizeInventoryReservationOwner(input.owner);
  const product = await lockInventoryProduct(tx, input.tenantId, input.productId);
  const outstanding = await inventoryReservationOutstanding(tx, {
    tenantId: input.tenantId,
    productId: product.id,
    ...owner
  });
  if (compare(outstanding, input.amount) < 0) {
    throw new HttpError(409, 'La liberación excede la reserva pendiente de este origen.', {
      code: 'INVENTORY_OWNER_RELEASE_EXCEEDS_RESERVED'
    });
  }

  const updated = await applyInventoryStandardEffect(tx, product, 'release', input.amount);
  const movement = await tx.inventoryMovement.create({
    data: {
      tenantId: input.tenantId,
      productId: product.id,
      type: 'release',
      quantity: input.amount,
      unitCost: input.unitCost ?? null,
      source: owner.source,
      sourceId: owner.sourceId,
      note: input.note ?? null
    }
  });
  return { movement, product: updated, outstandingBefore: outstanding };
}

export async function consumeInventoryReservationForOwner(
  tx: Prisma.TransactionClient,
  input: ReservationMutationInput
) {
  const owner = normalizeInventoryReservationOwner(input.owner);
  const product = await lockInventoryProduct(tx, input.tenantId, input.productId);
  const outstanding = await inventoryReservationOutstanding(tx, {
    tenantId: input.tenantId,
    productId: product.id,
    ...owner
  });
  if (compare(outstanding, input.amount) < 0) {
    throw new HttpError(409, 'El consumo excede la reserva pendiente de este origen.', {
      code: 'INVENTORY_OWNER_CONSUME_EXCEEDS_RESERVED'
    });
  }
  if (compare(product.reserved, input.amount) < 0 || compare(product.stock, input.amount) < 0) {
    throw new HttpError(409, 'El agregado de inventario no coincide con el ledger de reservas.', {
      code: 'INVENTORY_RESERVATION_INVARIANT_VIOLATION'
    });
  }

  const updated = await tx.product.update({
    where: { id: product.id },
    data: {
      reserved: { decrement: input.amount },
      stock: { decrement: input.amount }
    }
  });
  const releaseMovement = await tx.inventoryMovement.create({
    data: {
      tenantId: input.tenantId,
      productId: product.id,
      type: 'release',
      quantity: input.amount,
      unitCost: input.unitCost ?? null,
      source: owner.source,
      sourceId: owner.sourceId,
      note: input.note ?? null
    }
  });
  const outMovement = await tx.inventoryMovement.create({
    data: {
      tenantId: input.tenantId,
      productId: product.id,
      type: 'out',
      quantity: input.amount,
      unitCost: input.unitCost ?? null,
      source: 'reservation-consume',
      sourceId: releaseMovement.id,
      note: input.note ?? null
    }
  });

  return {
    product: updated,
    releaseMovement,
    outMovement,
    outstandingBefore: outstanding
  };
}
