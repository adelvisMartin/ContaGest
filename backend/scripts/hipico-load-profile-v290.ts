import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { createHorseRaceProvider } from '../src/modules/hipico-bot/hipico-race-provider.js';
import { initialHipicoState, reduceHipicoDomainEvent } from '../src/modules/hipico-bot/hipico-domain-state.js';

const { Client } = pg;
const databaseUrl = String(process.env.HIPICO_E2E_DATABASE_URL || process.env.DATABASE_URL || '').trim();
const OWNER_ID = String(process.env.HIPICO_E2E_OWNER_ID || '11111111-1111-4111-8111-111111111111');
const SHA = String(process.env.GITHUB_SHA || process.env.HIPICO_QA_SHA || process.env.HIPICO_CANDIDATE_SHA || 'local');
const artifact = path.resolve(process.env.HIPICO_PERF_ARTIFACT || 'artifacts/qa/hipico-v290/postgres-performance.json');
const volumes = [100, 500, 2000];

function requireIsolatedDatabase() {
  assert.ok(databaseUrl, 'HIPICO_E2E_DATABASE_URL is required');
  const url = new URL(databaseUrl);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase()), 'performance profile refuses non-local DB');
  assert.match(url.pathname.replace(/^\//, ''), /^hipico_e2e_[a-z0-9_]{8,63}$/, 'performance profile requires run-isolated database');
}

function memorySnapshot() {
  const value = process.memoryUsage();
  return { rssBytes: value.rss, heapTotalBytes: value.heapTotal, heapUsedBytes: value.heapUsed, externalBytes: value.external, arrayBuffersBytes: value.arrayBuffers };
}

function providerFixture(volume: number) {
  const competitors = Array.from({ length: Math.min(volume, 2000) }, (_, index) => `<competitor id="runner-${index + 1}" name="RUNNER ${index + 1}"/>`).join('');
  return `<?xml version="1.0"?><stage_summary><sport_event id="stage-${volume}"><competitors>${competitors}</competitors></sport_event><sport_event_status status="open"/></stage_summary>`;
}

async function providerProfile(volume: number) {
  let fetchCalls = 0;
  const xml = providerFixture(volume);
  const provider = createHorseRaceProvider({
    env: {
      HIPICO_RACE_PROVIDER: 'sportradar-uof',
      HIPICO_RACE_PROVIDER_BASE_URL: 'https://api.sportradar.com',
      HIPICO_SPORTRADAR_UOF_TOKEN: 'performance-fixture-token',
      HIPICO_RACE_PROVIDER_TIMEOUT_MS: '5000',
      HIPICO_RACE_PROVIDER_CACHE_TTL_MS: '30000'
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } });
    },
    now: () => Date.parse('2026-09-12T15:00:00.000Z')
  });
  const start = performance.now();
  const first = await provider.getStageSummary(String(700000 + volume));
  const firstMs = performance.now() - start;
  const cachedStart = performance.now();
  const cached = await provider.getStageSummary(String(700000 + volume));
  const cachedMs = performance.now() - cachedStart;
  assert.equal(fetchCalls, 1, 'provider cache should avoid a second upstream call');
  assert.equal(first.cached, false);
  assert.equal(cached.cached, true);
  assert.equal(first.xml, xml);
  return { firstMs: Number(firstMs.toFixed(3)), cachedMs: Number(cachedMs.toFixed(3)), bytes: Buffer.byteLength(xml), fetchCalls };
}

function reducerProfile(volume: number) {
  const start = performance.now();
  let checksum = 0;
  for (let index = 0; index < volume; index += 1) {
    const state = initialHipicoState('race');
    const result = reduceHipicoDomainEvent(state, {
      type: index % 5 === 0 ? 'UNKNOWN' : 'BET_RECORDED',
      sourceMessageKey: `profile-${volume}-${index}`,
      normalizedPayload: { group: index % 8, sequence: index }
    });
    checksum += result.state.stateVersion + result.state.seenSourceMessageKeys.size;
  }
  return { iterations: volume, elapsedMs: Number((performance.now() - start).toFixed(3)), checksum };
}

requireIsolatedDatabase();
const client = new Client({ connectionString: databaseUrl });
await client.connect();
const profiles: Array<Record<string, unknown>> = [];
try {
  for (const volume of volumes) {
    const groupKey = `perf-v290-${volume}`;
    const channelRows = await client.query(
      `INSERT INTO public.hipico_bot_channels(owner_id,group_key,label,channel_type,status,config)
       VALUES($1::uuid,$2,$3,'web_bridge','active','{"mode":"shadow_only"}'::jsonb)
       ON CONFLICT(owner_id,group_key) DO UPDATE SET status='active'
       RETURNING id`,
      [OWNER_ID, groupKey, `Performance ${volume}`]
    );
    const channelId = channelRows.rows[0].id;
    const memoryBefore = memorySnapshot();

    const insertStart = performance.now();
    await client.query(
      `INSERT INTO public.hipico_messages(
         owner_id,channel_id,channel_key,external_message_id,fingerprint,sender_id,sender_label,sender_role,
         sent_at,message_type,raw_text,classification,confidence,processing_status,normalized,metadata)
       SELECT $1::uuid,$2::uuid,$3,'perf-'||$3||'-'||n,md5($3||':'||n::text),'584121234567','E2E','participant',
              now() - (n || ' milliseconds')::interval,'text','estatus carrera '||n,'status_non_monetary',0.99,'processed',
              jsonb_build_object('sequence',n),jsonb_build_object('source','v290-load-profile')
       FROM generate_series(1,$4::int) AS n`,
      [OWNER_ID, channelId, groupKey, volume]
    );
    const insertMs = performance.now() - insertStart;

    const countStart = performance.now();
    const countRows = await client.query(`SELECT count(*)::int AS count FROM public.hipico_messages WHERE owner_id=$1::uuid AND channel_key=$2`, [OWNER_ID, groupKey]);
    const countMs = performance.now() - countStart;
    assert.equal(countRows.rows[0].count, volume);

    const recentStart = performance.now();
    const recentRows = await client.query(`SELECT external_message_id,received_at FROM public.hipico_messages WHERE owner_id=$1::uuid AND channel_key=$2 ORDER BY received_at DESC LIMIT 50`, [OWNER_ID, groupKey]);
    const recent50Ms = performance.now() - recentStart;
    assert.equal(recentRows.rows.length, Math.min(50, volume));

    const explainRows = await client.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT external_message_id,received_at FROM public.hipico_messages WHERE owner_id=$1::uuid AND channel_key=$2 ORDER BY received_at DESC LIMIT 50`, [OWNER_ID, groupKey]);
    const explain = explainRows.rows[0]['QUERY PLAN']?.[0] || null;
    const provider = await providerProfile(volume);
    const reducer = reducerProfile(volume);
    const memoryAfter = memorySnapshot();

    profiles.push({
      volume,
      postgres: {
        insertMs: Number(insertMs.toFixed(3)),
        countMs: Number(countMs.toFixed(3)),
        recent50Ms: Number(recent50Ms.toFixed(3)),
        plannerExecutionMs: explain?.['Execution Time'] ?? null,
        plannerPlanningMs: explain?.['Planning Time'] ?? null,
        plan: explain?.Plan ?? null
      },
      providerAdapter: {
        ...provider,
        transport: 'injected deterministic fixture',
        externalNetwork: { status: 'NOT_EXECUTED', reason: 'PR performance gate does not require vendor credentials or network' },
        financialAuthority: false
      },
      domainReducer: reducer,
      processMemory: {
        before: memoryBefore,
        after: memoryAfter,
        rssDeltaBytes: memoryAfter.rssBytes - memoryBefore.rssBytes,
        heapUsedDeltaBytes: memoryAfter.heapUsedBytes - memoryBefore.heapUsedBytes
      }
    });
  }

  const host = {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpuCount: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'unknown',
    totalMemoryBytes: os.totalmem(),
    targetProfile: 'Intel Core i5 6th generation / 16 GB RAM',
    equivalence: 'CI measurement only; physical target-device benchmark is separate evidence when that hardware is available.'
  };
  await fs.mkdir(path.dirname(artifact), { recursive: true });
  await fs.writeFile(artifact, `${JSON.stringify({ schema: 'hipico-performance.v290', sha: SHA, database: 'isolated-ephemeral', measuredAt: new Date().toISOString(), host, profiles, pdf: { status: 'NOT_EXECUTED', reason: 'native/OCR document runtime is gated separately until its locked dependencies are present' } }, null, 2)}\n`, 'utf8');
  console.log(`[hipico-v290] measured PostgreSQL/provider/reducer profiles for ${volumes.join('/')} operations`);
} finally {
  await client.end();
}
