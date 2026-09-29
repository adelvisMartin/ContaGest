import test from 'node:test';
import assert from 'node:assert/strict';

async function reservationModule() {
  return import('./inventory-reservation.service.js').catch(() => ({} as any));
}

function fakeTx(options: {
  stock?: string;
  reserved?: string;
  ownerReserved?: string;
  ownerReleased?: string;
} = {}) {
  const state = {
    product: {
      id: '11111111-1111-4111-8111-111111111111',
      tenantId: 'tenant-a',
      active: true,
      stock: options.stock ?? '10.000',
      reserved: options.reserved ?? '0.000'
    },
    ownerReserved: options.ownerReserved ?? '0.000',
    ownerReleased: options.ownerReleased ?? '0.000',
    aggregateWhere: [] as any[],
    movements: [] as any[],
    sequence: 0
  };

  const tx: any = {
    $queryRaw: async () => [{ id: state.product.id }],
    product: {
      findFirstOrThrow: async () => ({ ...state.product }),
      update: async ({ data }: any) => {
        const apply = (field: 'stock' | 'reserved', change: any) => {
          if (!change || typeof change !== 'object') return;
          const current = Number(state.product[field]);
          if (change.increment !== undefined) state.product[field] = (current + Number(change.increment)).toFixed(3);
          if (change.decrement !== undefined) state.product[field] = (current - Number(change.decrement)).toFixed(3);
        };
        apply('stock', data.stock);
        apply('reserved', data.reserved);
        return { ...state.product };
      }
    },
    inventoryMovement: {
      aggregate: async ({ where }: any) => {
        state.aggregateWhere.push({ ...where });
        return { _sum: { quantity: where.type === 'reservation' ? state.ownerReserved : state.ownerReleased } };
      },
      create: async ({ data }: any) => {
        state.sequence += 1;
        const row = { id: `movement-${state.sequence}`, createdAt: new Date(0), ...data };
        state.movements.push(row);
        return row;
      }
    }
  };

  return { tx, state };
}

test('reservation owner is canonical and reusable across ERP/vertical flows', async () => {
  const mod: any = await reservationModule();
  assert.equal(typeof mod.normalizeInventoryReservationOwner, 'function');

  const owner = mod.normalizeInventoryReservationOwner({
    source: '  SALES-ORDER  ',
    sourceId: '  so-2026-0001  '
  });

  assert.deepEqual(owner, { source: 'sales-order', sourceId: 'so-2026-0001' });
});

test('invalid owner metadata fails closed before inventory mutation', async () => {
  const mod: any = await reservationModule();
  assert.throws(
    () => mod.normalizeInventoryReservationOwner({ source: '', sourceId: 'so-a' }),
    (error: any) => error?.details?.code === 'INVENTORY_RESERVATION_SOURCE_INVALID'
  );
  assert.throws(
    () => mod.normalizeInventoryReservationOwner({ source: 'sales-order', sourceId: '' }),
    (error: any) => error?.details?.code === 'INVENTORY_RESERVATION_SOURCE_ID_INVALID'
  );
});

test('outstanding is derived only from reservation and release movements for the same owner and tenant', async () => {
  const mod: any = await reservationModule();
  assert.equal(typeof mod.inventoryReservationOutstanding, 'function');
  const { tx, state } = fakeTx({ ownerReserved: '5.000', ownerReleased: '2.000' });

  const outstanding = await mod.inventoryReservationOutstanding(tx, {
    tenantId: 'tenant-b',
    productId: '11111111-1111-4111-8111-111111111111',
    source: 'sales-order',
    sourceId: 'so-2026-0001'
  });

  assert.equal(outstanding.toFixed(3), '3.000');
  assert.equal(state.aggregateWhere.length, 2);
  for (const where of state.aggregateWhere) {
    assert.equal(where.tenantId, 'tenant-b');
    assert.equal(where.productId, state.product.id);
    assert.equal(where.source, 'sales-order');
    assert.equal(where.sourceId, 'so-2026-0001');
  }
});

test('reservation rejects quantity beyond stock minus global reserved', async () => {
  const mod: any = await reservationModule();
  const { tx, state } = fakeTx({ stock: '5.000', reserved: '4.000' });

  await assert.rejects(
    () => mod.reserveInventoryForOwner(tx, {
      tenantId: 'tenant-a',
      productId: state.product.id,
      amount: '2.000',
      owner: { source: 'sales-order', sourceId: 'so-a' }
    }),
    (error: any) => error?.details?.code === 'INVENTORY_INSUFFICIENT_STOCK'
  );
  assert.equal(state.product.reserved, '4.000');
  assert.equal(state.movements.length, 0);
});

test('one owner cannot release quantity reserved by another owner', async () => {
  const mod: any = await reservationModule();
  assert.equal(typeof mod.releaseInventoryReservationForOwner, 'function');
  const { tx, state } = fakeTx({ reserved: '8.000', ownerReserved: '2.000', ownerReleased: '0.000' });

  await assert.rejects(
    () => mod.releaseInventoryReservationForOwner(tx, {
      tenantId: 'tenant-a',
      productId: state.product.id,
      amount: '3.000',
      owner: { source: 'sales-order', sourceId: 'so-a' }
    }),
    (error: any) => error?.details?.code === 'INVENTORY_OWNER_RELEASE_EXCEEDS_RESERVED'
  );
  assert.equal(state.product.reserved, '8.000');
  assert.equal(state.movements.length, 0);
});

test('one owner cannot consume quantity beyond its outstanding reservation', async () => {
  const mod: any = await reservationModule();
  const { tx, state } = fakeTx({ stock: '10.000', reserved: '8.000', ownerReserved: '1.000', ownerReleased: '0.000' });

  await assert.rejects(
    () => mod.consumeInventoryReservationForOwner(tx, {
      tenantId: 'tenant-a',
      productId: state.product.id,
      amount: '2.000',
      owner: { source: 'sales-order', sourceId: 'so-a' }
    }),
    (error: any) => error?.details?.code === 'INVENTORY_OWNER_CONSUME_EXCEEDS_RESERVED'
  );
  assert.equal(state.product.stock, '10.000');
  assert.equal(state.product.reserved, '8.000');
  assert.equal(state.movements.length, 0);
});

test('consuming an owner reservation decrements reserved and stock atomically and links audit movements', async () => {
  const mod: any = await reservationModule();
  assert.equal(typeof mod.consumeInventoryReservationForOwner, 'function');
  const { tx, state } = fakeTx({ stock: '10.000', reserved: '5.000', ownerReserved: '3.000', ownerReleased: '0.000' });

  const result = await mod.consumeInventoryReservationForOwner(tx, {
    tenantId: 'tenant-a',
    productId: state.product.id,
    amount: '2.000',
    owner: { source: 'sales-order', sourceId: 'so-a' },
    note: 'Delivery fulfillment'
  });

  assert.equal(result.product.stock, '8.000');
  assert.equal(result.product.reserved, '3.000');
  assert.equal(result.releaseMovement.type, 'release');
  assert.equal(result.releaseMovement.source, 'sales-order');
  assert.equal(result.releaseMovement.sourceId, 'so-a');
  assert.equal(result.outMovement.type, 'out');
  assert.equal(result.outMovement.source, 'reservation-consume');
  assert.equal(result.outMovement.sourceId, result.releaseMovement.id);
});
