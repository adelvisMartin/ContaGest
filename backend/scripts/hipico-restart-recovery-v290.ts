import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/database/prisma.js';
import { RaceLifecycleStore } from '../src/modules/hipico/race.store.js';

const phase = process.argv[2];
const OWNER_ID = process.env.HIPICO_E2E_OWNER_ID || '11111111-1111-4111-8111-111111111111';
const GROUP_KEY = 'e2e-restart-group';
const databaseUrl = String(process.env.HIPICO_E2E_DATABASE_URL || '').trim();
const stateFile = path.resolve(process.env.HIPICO_RESTART_STATE_FILE || '../artifacts/qa/hipico-v290/restart-state.json');

function requireIsolatedDatabase() {
  assert.ok(databaseUrl, 'HIPICO_E2E_DATABASE_URL is required');
  const url = new URL(databaseUrl);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase()));
  assert.match(url.pathname.replace(/^\//, ''), /^hipico_e2e_[a-z0-9_]{8,63}$/);
}

function cmd(command: any, expectedState: any, requestId: string) {
  return {
    command,
    expectedState,
    requestId,
    actorId: 'restart-e2e',
    actorType: 'operator' as const,
    correlationId: `corr-${requestId}`,
    payload: {},
    evidence: []
  };
}

requireIsolatedDatabase();
const store = new RaceLifecycleStore();

try {
  if (phase === 'prepare') {
    const meeting = await store.createMeeting({ ownerId: OWNER_ID, groupKey: GROUP_KEY, name: 'Restart E2E Meeting' });
    const race = await store.createRace({ ownerId: OWNER_ID, groupKey: GROUP_KEY, meetingId: meeting.id, number: 7, name: 'Restart E2E Race' });
    const openRequestId = 'restart-open-290';
    const opened = await store.command(OWNER_ID, GROUP_KEY, race.id, cmd('OPEN', 'DISCOVERED', openRequestId));
    assert.equal(opened.duplicate, false);
    assert.equal(opened.transition.to, 'OPEN');
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(stateFile, JSON.stringify({ ownerId: OWNER_ID, groupKey: GROUP_KEY, meetingId: meeting.id, raceId: race.id, openRequestId, preparedAt: new Date().toISOString() }, null, 2));
    console.log(`[hipico-v290] restart phase prepared race ${race.id}; process exits now`);
  } else if (phase === 'verify') {
    const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
    assert.equal(state.ownerId, OWNER_ID);
    assert.equal(state.groupKey, GROUP_KEY);
    const restored = await store.getRace(OWNER_ID, GROUP_KEY, state.raceId);
    assert.equal(restored?.state, 'OPEN', 'new process must recover persisted OPEN state');
    const replay = await store.command(OWNER_ID, GROUP_KEY, state.raceId, cmd('OPEN', 'DISCOVERED', state.openRequestId));
    assert.equal(replay.duplicate, true, 'same request after restart must be idempotent');
    const eventsAfterReplay = await store.history(OWNER_ID, GROUP_KEY, state.raceId);
    assert.equal(eventsAfterReplay.filter((event: any) => event.requestId === state.openRequestId).length, 1, 'replay must not append another event');
    const closed = await store.command(OWNER_ID, GROUP_KEY, state.raceId, cmd('CLOSE', 'OPEN', 'restart-close-290'));
    assert.equal(closed.duplicate, false);
    assert.equal(closed.transition.to, 'CLOSED');
    const finalRace = await store.getRace(OWNER_ID, GROUP_KEY, state.raceId);
    assert.equal(finalRace?.state, 'CLOSED', 'new process must continue the persisted lifecycle');
    const evidence = { ...state, verifiedAt: new Date().toISOString(), finalState: finalRace?.state, replayBlocked: true, eventCount: (await store.history(OWNER_ID, GROUP_KEY, state.raceId)).length };
    await fs.writeFile(stateFile, JSON.stringify(evidence, null, 2));
    console.log(`[hipico-v290] restart recovery verified for race ${state.raceId}`);
  } else {
    throw new Error('Usage: tsx scripts/hipico-restart-recovery-v290.ts <prepare|verify>');
  }
} finally {
  await prisma.$disconnect();
}
