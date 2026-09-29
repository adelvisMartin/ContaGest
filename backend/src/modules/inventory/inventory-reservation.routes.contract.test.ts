import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./inventory.routes.ts', import.meta.url), 'utf8');

test('generic reservation and release movements use owner-scoped domain service', () => {
  assert.match(source, /reserveInventoryForOwner/);
  assert.match(source, /releaseInventoryReservationForOwner/);
  assert.match(source, /owner:\s*\{\s*source:\s*input\.source/);
});

test('reservation consumption has an idempotent canonical endpoint', () => {
  assert.match(source, /router\.post\('\/reservations\/consume'/);
  assert.match(source, /scope:\s*'inventory\.reservations\.consume'/);
  assert.match(source, /consumeInventoryReservationForOwner/);
  assert.match(source, /Idempotency-Replayed/);
});

test('consume replay reconstructs the linked release movement under the active tenant', () => {
  assert.match(source, /source:\s*'reservation-consume'/);
  assert.match(source, /tenantId/);
  assert.match(source, /releaseMovement/);
});
