import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { readHipicoDomainAggregate } from './hipico-domain-query.store.js';
import { readCanonicalLabRace } from './hipico-lab-canonical-read.js';
import { persistHipicoDomainEvent } from './hipico-domain-event.store.js';
import { operationalRaceContextKey } from './hipico-race-context-key.js';

// This file intentionally has no test skip: its runner must provide a disposable
// PostgreSQL 17 database. It is invoked explicitly, not by the unit-test glob.
function assertIsolatedPg17() {
  const connection = new URL(String(process.env.DATABASE_URL || ''));
  const database = decodeURIComponent(connection.pathname.slice(1));
  // prisma.ts prioritizes DATABASE_RUNTIME_URL over DATABASE_URL. Never let a
  // preexisting developer/prod override redirect this destructive QA fixture.
  assert.equal(String(process.env.DATABASE_RUNTIME_URL || '').trim(), '',
    'PG17 synthetic QA refuses DATABASE_RUNTIME_URL overrides');
  const admin = new URL(String(process.env.HIPICO_E2E_ADMIN_URL || ''));
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(admin.hostname),
    'PG17 synthetic QA requires a local ephemeral database allocator');
  assert.equal(admin.pathname, '/postgres');
  assert.equal(admin.hostname, connection.hostname);
  assert.equal(admin.port || '5432', connection.port || '5432');
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(connection.hostname),
    'Canonical snapshot integration must not connect to a remote database');
  assert.match(database, /^hipico_e2e_[a-z0-9_]{8,63}$/,
    'Canonical snapshot integration requires a disposable QA database');
  assert.equal(database, process.env.HIPICO_E2E_DATABASE_NAME,
    'The current database must match the ephemeral test allocator');
}

async function seedOpenedRace(ownerId: string, groupKey: string, aggregateKey: string) {
  const eventId = randomUUID();
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`
      INSERT INTO public.hipico_domain_aggregates
        (owner_id, group_key, aggregate_kind, aggregate_key, status, state_version)
      VALUES (${ownerId}::uuid, ${groupKey}, 'race', ${aggregateKey}, 'OPEN', 1)
    `;
    await tx.$executeRaw`
      INSERT INTO public.hipico_domain_events
        (id, owner_id, group_key, aggregate_kind, aggregate_key,
         source_message_key, event_type, disposition, previous_state, next_state,
         reason, event_timestamp, operator_confirmed, confirmation_reason)
      VALUES
        (${eventId}, ${ownerId}::uuid, ${groupKey}, 'race', ${aggregateKey},
         'qa-open', 'RACE_OPENED', 'applied', 'PREPARING', 'OPEN',
         'VALID_TRANSITION', '2026-11-19T10:00:00Z'::timestamptz,
         true, 'Synthetic operator opening')
    `;
  });
}

test('PG17 recorded-order index upgrade preserves existing append-only evidence', async () => {
  assertIsolatedPg17();
  const beforeIndex = await readHipicoDomainAggregate({
    ownerId: '22222222-2222-4222-8222-222222222222',
    groupKey: 'pg17-upgrade-fixture',
    aggregateKind: 'race',
    aggregateKey: 'qa_preindex_existing',
    limit: 5
  });
  assert.equal(beforeIndex?.aggregate.status, 'OPEN');
  assert.equal(beforeIndex?.aggregate.stateVersion, 1);
  assert.deepEqual(beforeIndex?.events.map(row => row.eventType), ['RACE_OPENED']);
  assert.equal(beforeIndex?.events[0].sourceMessageKey, 'qa-existing-message');
});

test('PostgreSQL 17 canonical snapshot stays consistent under a concurrent writer and tenant A/B', async () => {
  assertIsolatedPg17();
  const version = await prisma.$queryRaw<Array<{ version: number; name: string }>>`
    SELECT current_setting('server_version_num')::int AS version, current_database() AS name
  `;
  assert.ok(version[0].version >= 170000 && version[0].version < 180000,
    'PostgreSQL 17 is required, not an older or newer unverified major version');
  assert.equal(version[0].name, process.env.HIPICO_E2E_DATABASE_NAME);

  const ownerA = randomUUID();
  const ownerB = randomUUID();
  const groupA = 'synthetic-lab-a';
  const groupB = 'synthetic-lab-b';
  const aggregateKey = `synthetic-snapshot-${randomUUID()}`;
  const scope = { ownerId: ownerA, groupKey: groupA, aggregateKind: 'race' as const, aggregateKey, limit: 30 };

  await seedOpenedRace(ownerA, groupA, aggregateKey);
  await seedOpenedRace(ownerB, groupA, aggregateKey);
  await seedOpenedRace(ownerA, groupB, aggregateKey);

  let readQueries = 0;
  let writerCommitted = false;
  const writer = new PrismaClient();
  try {
    const intercepted = {
      $transaction: (async (callback: (tx: any) => Promise<unknown>, options: { isolationLevel: 'RepeatableRead' }) =>
        prisma.$transaction(async tx => {
          assert.equal(options.isolationLevel, 'RepeatableRead');
          return callback({
            $queryRaw: async (...args: any[]) => {
              const rows = await (tx.$queryRaw as any)(...args);
              readQueries++;
              if (readQueries === 1) {
                const closedEventId = randomUUID();
                // A separate connection commits between the two SELECTs.
                await writer.$transaction(async w => {
                  await w.$executeRaw`
                    UPDATE public.hipico_domain_aggregates
                    SET status = 'CLOSED', state_version = 2, updated_at = now()
                    WHERE owner_id = ${ownerA}::uuid AND group_key = ${groupA}
                      AND aggregate_kind = 'race' AND aggregate_key = ${aggregateKey}
                  `;
                  await w.$executeRaw`
                    INSERT INTO public.hipico_domain_events
                      (id, owner_id, group_key, aggregate_kind, aggregate_key,
                       source_message_key, event_type, disposition, previous_state,
                       next_state, reason, event_timestamp, operator_confirmed, confirmation_reason)
                    VALUES (${closedEventId}, ${ownerA}::uuid, ${groupA}, 'race', ${aggregateKey},
                            'qa-close', 'RACE_CLOSED', 'applied', 'OPEN', 'CLOSED',
                            'VALID_TRANSITION', '2026-11-19T11:00:00Z'::timestamptz,
                            true, 'Synthetic operator closure')
                  `;
                });
                writerCommitted = true;
              }
              return rows;
            }
          });
        }, options)) as typeof prisma.$transaction
    };
    const snapshot = await readHipicoDomainAggregate(scope, intercepted);
    assert.equal(writerCommitted, true);
    assert.equal(readQueries, 2);
    assert.equal(snapshot?.aggregate.status, 'OPEN');
    assert.equal(snapshot?.aggregate.stateVersion, 1);
    assert.deepEqual(snapshot?.events.map(event => event.eventType), ['RACE_OPENED']);
  } finally {
    await writer.$disconnect();
  }

  // The next transaction sees the committed revision and all its evidence.
  const current = await readHipicoDomainAggregate(scope);
  assert.equal(current?.aggregate.status, 'CLOSED');
  assert.equal(current?.aggregate.stateVersion, 2);
  assert.deepEqual(current?.events.map(event => event.eventType), ['RACE_CLOSED', 'RACE_OPENED']);

  // Owner and group boundaries still constrain both the aggregate and events.
  for (const otherScope of [
    { ...scope, ownerId: ownerB },
    { ...scope, groupKey: groupB }
  ]) {
    const other = await readHipicoDomainAggregate(otherScope);
    assert.equal(other?.aggregate.status, 'OPEN');
    assert.equal(other?.aggregate.stateVersion, 1);
    assert.deepEqual(other?.events.map(event => event.eventType), ['RACE_OPENED']);
  }
  assert.equal(await readHipicoDomainAggregate({ ...scope, groupKey: 'absent-lab-group' }), null);
  await assert.rejects(
    readHipicoDomainAggregate({ ...scope, groupKey: '' }),
    /HIPICO_DOMAIN_READ_SCOPE_REQUIRED/
  );

  // This separate probe exercises actual PostgreSQL RLS as a non-owner role.
  // Service-level group filtering above is different from the owner's RLS policy.
  async function visibleAs(actingOwner: string | null) {
    return prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
      if (actingOwner) {
        await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', ${actingOwner}, true)`;
      }
      const aggregates = await tx.$queryRaw<Array<{ ownerId: string; groupKey: string }>>`
        SELECT owner_id::text AS "ownerId", group_key AS "groupKey"
        FROM public.hipico_domain_aggregates
        WHERE aggregate_key = ${aggregateKey} ORDER BY group_key
      `;
      const events = await tx.$queryRaw<Array<{ ownerId: string; groupKey: string }>>`
        SELECT owner_id::text AS "ownerId", group_key AS "groupKey"
        FROM public.hipico_domain_events
        WHERE aggregate_key = ${aggregateKey} ORDER BY group_key, event_type
      `;
      return { aggregates, events };
    });
  }
  const ownerAView = await visibleAs(ownerA);
  assert.deepEqual(ownerAView.aggregates, [
    { ownerId: ownerA, groupKey: groupA },
    { ownerId: ownerA, groupKey: groupB }
  ]);
  assert.deepEqual(ownerAView.events.map(row => row.groupKey), [groupA, groupA, groupB]);
  assert.ok(ownerAView.events.every(row => row.ownerId === ownerA));
  const ownerBView = await visibleAs(ownerB);
  assert.deepEqual(ownerBView.aggregates, [{ ownerId: ownerB, groupKey: groupA }]);
  assert.deepEqual(ownerBView.events, [{ ownerId: ownerB, groupKey: groupA }]);
  assert.deepEqual(await visibleAs(null), { aggregates: [], events: [] });

  // SELECT-only RLS access does not grant mutation authority. Verify the
  // actual SQLSTATE 42501, not just an arbitrary database rejection.
  const denied = async (role: 'anon' | 'authenticated', action: 'read' | 'write') => {
    await assert.rejects(
      prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        if (action === 'read') {
          await tx.$queryRaw`
            SELECT id FROM public.hipico_domain_events
            WHERE aggregate_key = ${aggregateKey} LIMIT 1
          `;
        } else {
          await tx.$executeRaw`
            UPDATE public.hipico_domain_aggregates
            SET status = 'CLOSED'
            WHERE owner_id = ${ownerA}::uuid
              AND group_key = ${groupB}
              AND aggregate_key = ${aggregateKey}
          `;
        }
      }),
      (error: unknown) => {
        const dbError = error as { code?: string; meta?: { code?: string } };
        assert.equal(dbError.code, 'P2010',
          `${role}/${action} must be rejected by PostgreSQL, not by a test setup error`);
        assert.equal(dbError.meta?.code, '42501',
          `${role}/${action} must fail for insufficient privileges`);
        return true;
      }
    );
  };
  await denied('anon', 'read');
  await denied('authenticated', 'write');
});

test('PostgreSQL 17 synthetic canonical-read latency baseline is observable', async () => {
  assertIsolatedPg17();
  const index = await prisma.$queryRaw<Array<{
    valid: boolean; ready: boolean; definition: string
  }>>`
    SELECT i.indisvalid AS valid, i.indisready AS ready,
           pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i
    WHERE i.indexrelid = to_regclass('public.hipico_domain_events_recorded_order_v837')
  `;
  assert.equal(index.length, 1, 'QA migration must install the recorded-order index');
  assert.equal(index[0].valid, true, 'A failed concurrent index build is not a valid release');
  assert.equal(index[0].ready, true);
  assert.match(index[0].definition, /created_at DESC, id DESC/);
  const ownerId = randomUUID();
  const groupKey = 'synthetic-perf-lab';
  const aggregateKey = `synthetic-perf-${randomUUID()}`;
  await seedOpenedRace(ownerId, groupKey, aggregateKey);
  const latencies: number[] = [];
  for (let index = 0; index < 100; index++) {
    const started = performance.now();
    const result = await readHipicoDomainAggregate({
      ownerId, groupKey, aggregateKey, aggregateKind: 'race', limit: 30
    });
    latencies.push(performance.now() - started);
    assert.equal(result?.aggregate.stateVersion, 1);
    assert.equal(result?.events.length, 1);
  }
  const sorted = latencies.slice().sort((a, b) => a - b);
  const p50 = sorted[Math.ceil(sorted.length * 0.50) - 1];
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  assert.ok(Number.isFinite(p50) && Number.isFinite(p95) && p95 >= p50);
  // Numeric evidence only. No PII, source messages or non-synthetic IDs.
  // This is a baseline, not a release performance SLA.
  console.log(JSON.stringify({
    suite: 'hipico-canonical-read-pg17',
    readCount: sorted.length,
    p50Ms: Number(p50.toFixed(2)),
    p95Ms: Number(p95.toFixed(2)),
    pgMajor: 17
  }));
});

test('backdated correction recorded after a result cannot be hidden from LAB', async () => {
  assertIsolatedPg17();
  const ownerId = randomUUID();
  const groupKey = 'synthetic-backdated-correction';
  const race = { raceNumber: 5, racetrack: 'Churchill Downs', raceDate: '2026-11-19' };
  const aggregateKey = operationalRaceContextKey(race);
  assert.ok(aggregateKey);
  await seedOpenedRace(ownerId, groupKey, aggregateKey);

  const resultId = randomUUID();
  const correctionId = randomUUID();
  const raceScope = {
    raceContextComplete: true, racetrack: race.racetrack,
    raceNumber: race.raceNumber, raceDate: race.raceDate
  };
  const closed = await persistHipicoDomainEvent({
    ownerId, groupKey, aggregateKind: 'race', aggregateKey,
    event: {
      type: 'RACE_CLOSED', sourceMessageKey: 'synthetic-close',
      timestamp: '2026-11-19T11:00:00.000Z',
      operatorConfirmed: true,
      confirmationReason: 'Synthetic operator race closure',
      normalizedPayload: raceScope,
      source: 'canonical_operator_api'
    }
  });
  assert.equal(closed.nextState, 'CLOSED');
  const result = await persistHipicoDomainEvent({
    ownerId, groupKey, aggregateKind: 'race', aggregateKey,
    event: {
      type: 'RESULT_RECORDED', eventId: resultId,
      sourceMessageKey: 'synthetic-result',
      timestamp: '2026-11-19T12:00:00.000Z',
      operatorConfirmed: true,
      confirmationReason: 'Synthetic operator confirmed result',
      normalizedPayload: { ...raceScope, board: ['5', '1'] },
      source: 'canonical_operator_api'
    }
  });
  assert.equal(result.nextState, 'RESULT_RECEIVED');
  const beforeCorrection = await readCanonicalLabRace({
    ownerId, groupKey, race, purpose: 'result'
  });
  assert.equal(beforeCorrection.available, true);
  assert.equal(beforeCorrection.reason, 'CANONICAL_RESULT_CONFIRMED_INTERNAL');


  // Use the production append-only writer. The correction is inserted after
  // the result but carries an older, source-supplied event timestamp.
  const correction = await persistHipicoDomainEvent({
    ownerId, groupKey, aggregateKind: 'race', aggregateKey,
    event: {
      type: 'CORRECTION',
      eventId: correctionId,
      sourceMessageKey: 'synthetic-backdate',
      originalEventId: resultId,
      timestamp: '2026-11-19T08:00:00.000Z',
      operatorConfirmed: true,
      confirmationReason: 'Synthetic backdated correction',
      source: 'canonical_operator_api'
    }
  });
  assert.equal(correction.disposition, 'evidence_only');

  const domain = await readHipicoDomainAggregate({
    ownerId, groupKey, aggregateKind: 'race', aggregateKey, limit: 30
  });
  assert.equal(domain?.events[0].eventType, 'CORRECTION',
    'Database append chronology must take priority over backdated source timestamp');
  assert.equal(domain?.events[1].eventType, 'RESULT_RECORDED');
  const published = await readCanonicalLabRace({
    ownerId, groupKey, race, purpose: 'result'
  });
  assert.equal(published.available, false);
  assert.equal(published.reason, 'CANONICAL_RESULT_EVIDENCE_MISSING');
});

test('read and write reject unsafe BIGINT optimistic versions without additional evidence', async () => {
  assertIsolatedPg17();
  const ownerId = randomUUID();
  const groupKey = 'synthetic-unsafe-version';
  const aggregateKey = `synthetic-bigint-${randomUUID()}`;
  await seedOpenedRace(ownerId, groupKey, aggregateKey);
  const unsafeVersion = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
  await prisma.$executeRaw`
    UPDATE public.hipico_domain_aggregates SET state_version = ${unsafeVersion}
    WHERE owner_id = ${ownerId}::uuid AND group_key = ${groupKey}
      AND aggregate_kind = 'race' AND aggregate_key = ${aggregateKey}
  `;
  await assert.rejects(readHipicoDomainAggregate({
    ownerId, groupKey, aggregateKind: 'race', aggregateKey
  }), /HIPICO_DOMAIN_STATE_VERSION_UNSAFE/);
  await assert.rejects(persistHipicoDomainEvent({
    ownerId, groupKey, aggregateKind: 'race', aggregateKey,
    event: {
      type: 'RACE_CLOSED', sourceMessageKey: 'synthetic-unsafe-write',
      timestamp: '2026-11-19T12:00:00.000Z',
      operatorConfirmed: true,
      confirmationReason: 'Reject unsafe version'
    }
  }), /HIPICO_DOMAIN_STATE_VERSION_UNSAFE/);
  const count = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*) AS count FROM public.hipico_domain_events
    WHERE owner_id = ${ownerId}::uuid AND group_key = ${groupKey}
      AND aggregate_kind = 'race' AND aggregate_key = ${aggregateKey}
  `;
  assert.equal(count[0].count, 1n, 'An unsafe version cannot append new evidence');
});

test.after(async () => {
  await prisma.$disconnect();
});
