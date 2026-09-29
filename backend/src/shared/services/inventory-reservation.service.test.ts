import test from 'node:test';
import assert from 'node:assert/strict';

test('reservation owner is canonical and reusable across ERP/vertical flows', async () => {
  const mod: any = await import('./inventory-reservation.service.js').catch(() => ({}));
  assert.equal(typeof mod.normalizeInventoryReservationOwner, 'function');

  const owner = mod.normalizeInventoryReservationOwner({
    source: '  SALES-ORDER  ',
    sourceId: '  so-2026-0001  '
  });

  assert.deepEqual(owner, { source: 'sales-order', sourceId: 'so-2026-0001' });
});
