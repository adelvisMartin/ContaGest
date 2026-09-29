import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./inventory.routes.ts', import.meta.url), 'utf8');

test('generic reservation and release movements use the normalized owner-scoped domain service', () => {
  assert.match(source, /normalizeInventoryReservationOwner\(\{ source: input\.source \|\| '', sourceId: input\.sourceId \|\| '' \}\)/);
  assert.match(source, /reserveInventoryForOwner/);
  assert.match(source, /releaseInventoryReservationForOwner/);
  assert.match(source, /owner:\s*owner!/);
});

test('reservation consumption has an idempotent canonical endpoint', () => {
  assert.match(source, /router\.post\('\/reservations\/consume'/);
  assert.match(source, /scope:\s*'inventory\.reservations\.consume'/);
  assert.match(source, /consumeInventoryReservationForOwner/);
  assert.match(source, /replayReservationConsumption/);
  assert.match(source, /Idempotency-Replayed/);
});

test('consume replay reconstructs the linked release movement under the active tenant', () => {
  assert.match(source, /where:\s*\{ id: resourceId, tenantId, type: 'out', source: 'reservation-consume' \}/);
  assert.match(source, /where:\s*\{ id: outMovement\.sourceId, tenantId, productId: outMovement\.productId, type: 'release' \}/);
  assert.match(source, /releaseMovement/);
});

test('generic reversal cannot split the two movements of reservation consumption', () => {
  assert.match(source, /INVENTORY_RESERVATION_CONSUMPTION_REQUIRES_WORKFLOW_REVERSAL/);
  assert.match(source, /source:\s*'reservation-consume', sourceId: original\.id, type:\s*'out'/);
});
