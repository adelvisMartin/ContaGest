import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/database/prisma.js';
import { persistHipicoDomainEvent } from '../src/modules/hipico-bot/hipico-domain-event.store.js';
import { readHipicoDomainAggregate } from '../src/modules/hipico-bot/hipico-domain-query.store.js';

const SHA40 = /^[0-9a-f]{40}$/i;
const phase = String(process.argv[2] || '').trim();
const OWNER_ID = String(process.env.HIPICO_E2E_OWNER_ID || '11111111-1111-4111-8111-111111111111');
const DATABASE_URL = String(process.env.HIPICO_E2E_DATABASE_URL || process.env.DATABASE_URL || '').trim();
const artifact = path.resolve(process.env.HIPICO_RESTART_STATE_FILE || 'artifacts/qa/hipico-v290/restart-state.json');

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
  } catch {
    return '';
  }
}

const candidateSha = String(process.env.HIPICO_CANDIDATE_SHA || process.env.GITHUB_SHA || gitHead()).trim().toLowerCase();

function requireIsolatedDatabase() {
  assert.match(candidateSha, SHA40, 'restart recovery requires exact candidate SHA');
  assert.ok(DATABASE_URL, 'HIPICO_E2E_DATABASE_URL is required');
  const url = new URL(DATABASE_URL);
  assert.ok(
    ['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase()),
    'restart recovery refuses non-local PostgreSQL'
  );
  assert.match(
    url.pathname.replace(/^\//, ''),
    /^hipico_e2e_[a-z0-9_]{8,63}$/,
    'restart recovery requires hipico_e2e_ database'
  );
}

function lifecycleEvent(
  type: 'RACE_OPENED' | 'RACE_CLOSED',
  sourceMessageKey: string,
  timestamp: string,
  aggregateKey: string
) {
  return {
    type,
    sourceMessageKey,
    sourceMessageId: sourceMessageKey,
    rawMessage: type,
    normalizedPayload: { raceKey: aggregateKey, restartRecovery: true },
    actorRef: 'e2e:restart',
    source: 'restart_recovery_v290',
    parserVersion: 'v290-current',
    schemaVersion: 1,
    timestamp,
    operatorConfirmed: true,
    confirmationReason: 'restart recovery e2e validation'
  } as const;
}

async function eventCount(groupKey: string, aggregateKey: string) {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM public.hipico_domain_events
    WHERE owner_id=${OWNER_ID}::uuid
      AND group_key=${groupKey}
      AND aggregate_kind='race'
      AND aggregate_key=${aggregateKey}
  `;
  return Number(rows[0]?.count || 0);
}

requireIsolatedDatabase();
try {
  if (phase === 'prepare') {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const groupKey = `restart-${suffix}`;
    const aggregateKey = `race-${suffix}`;
    const sourceMessageKey = `restart-open-${suffix}`;
    const timestamp = new Date().toISOString();
    const opened = await persistHipicoDomainEvent({
      ownerId: OWNER_ID,
      groupKey,
      aggregateKind: 'race',
      aggregateKey,
      event: lifecycleEvent('RACE_OPENED', sourceMessageKey, timestamp, aggregateKey)
    });
    assert.equal(opened.duplicate, false);
    assert.equal(opened.nextState, 'OPEN');
    assert.equal(await eventCount(groupKey, aggregateKey), 1);
    await fs.mkdir(path.dirname(artifact), { recursive: true });
    await fs.writeFile(artifact, `${JSON.stringify({
      schema: 'hipico-restart.v290-current',
      sha: candidateSha,
      ownerId: OWNER_ID,
      groupKey,
      aggregateKey,
      sourceMessageKey,
      timestamp,
      preparedAt: new Date().toISOString()
    }, null, 2)}\n`, 'utf8');
    console.log(`[hipico-v290] restart prepare persisted ${groupKey}/${aggregateKey} sha=${candidateSha}`);
  } else if (phase === 'verify') {
    const state = JSON.parse(await fs.readFile(artifact, 'utf8'));
    assert.equal(state.sha, candidateSha, 'restart evidence SHA drift');
    assert.equal(state.ownerId, OWNER_ID);
    const before = await readHipicoDomainAggregate({
      ownerId: OWNER_ID,
      groupKey: state.groupKey,
      aggregateKind: 'race',
      aggregateKey: state.aggregateKey,
      limit: 20
    });
    assert.equal(before?.aggregate.status, 'OPEN');
    assert.equal(before?.aggregate.stateVersion, 1);
    assert.equal(await eventCount(state.groupKey, state.aggregateKey), 1);

    const replay = await persistHipicoDomainEvent({
      ownerId: OWNER_ID,
      groupKey: state.groupKey,
      aggregateKind: 'race',
      aggregateKey: state.aggregateKey,
      event: lifecycleEvent('RACE_OPENED', state.sourceMessageKey, state.timestamp, state.aggregateKey)
    });
    assert.equal(replay.duplicate, true);
    assert.equal(replay.stateChanged, false);
    assert.equal(await eventCount(state.groupKey, state.aggregateKey), 1);

    const closeKey = `${state.sourceMessageKey}:close`;
    const closed = await persistHipicoDomainEvent({
      ownerId: OWNER_ID,
      groupKey: state.groupKey,
      aggregateKind: 'race',
      aggregateKey: state.aggregateKey,
      event: lifecycleEvent('RACE_CLOSED', closeKey, new Date().toISOString(), state.aggregateKey)
    });
    assert.equal(closed.nextState, 'CLOSED');
    const after = await readHipicoDomainAggregate({
      ownerId: OWNER_ID,
      groupKey: state.groupKey,
      aggregateKind: 'race',
      aggregateKey: state.aggregateKey,
      limit: 20
    });
    assert.equal(after?.aggregate.status, 'CLOSED');
    assert.equal(after?.aggregate.stateVersion, 2);
    assert.equal(await eventCount(state.groupKey, state.aggregateKey), 2);

    await fs.writeFile(artifact, `${JSON.stringify({
      ...state,
      verifiedAt: new Date().toISOString(),
      status: 'PASS',
      finalState: 'CLOSED'
    }, null, 2)}\n`, 'utf8');
    console.log(`[hipico-v290] restart verify PASS ${state.groupKey}/${state.aggregateKey} sha=${candidateSha}`);
  } else {
    throw new Error('Usage: tsx backend/scripts/hipico-restart-recovery-v290.ts prepare|verify');
  }
} finally {
  await prisma.$disconnect();
}
