import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import PDFDocument from 'pdfkit';
import pg from 'pg';
import { createPdfJsDocumentExtractor, documentExtractorCapability } from '../src/modules/hipico/document-extractor.js';
import { createHorseRaceProvider } from '../src/modules/hipico-bot/hipico-race-provider.js';
import { createSportradarRacingProvider, normalizeSportradarStage } from '../src/modules/hipico/sportradar-provider.adapter.js';
import { ProviderEvidenceStore } from '../src/modules/hipico/provider-evidence.store.js';

const { Client } = pg;
const databaseUrl = String(process.env.HIPICO_E2E_DATABASE_URL || '').trim();
const OWNER_ID = process.env.HIPICO_E2E_OWNER_ID || '11111111-1111-4111-8111-111111111111';
const SHA = process.env.GITHUB_SHA || process.env.HIPICO_QA_SHA || 'local';
const artifact = path.resolve(process.env.HIPICO_PERF_ARTIFACT || '../artifacts/qa/hipico-v290/production-performance.json');
const volumes = [100, 500, 2000];

function requireIsolatedDatabase() {
  assert.ok(databaseUrl, 'HIPICO_E2E_DATABASE_URL is required');
  const url = new URL(databaseUrl);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase()), 'performance profile refuses non-local DB');
  assert.match(url.pathname.replace(/^\//, ''), /^hipico_e2e_[a-z0-9_]{8,63}$/, 'performance profile requires run-isolated database');
}

async function pdfBuffer(volume: number) {
  const doc = new PDFDocument({ autoFirstPage: true, compress: true, margin: 36, info: { Title: `Control Hipico perf ${volume}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  doc.fontSize(12).text(`PROGRAMA DE CARRERAS PERF ${volume}`);
  for (let index = 1; index <= volume; index += 1) doc.fontSize(8).text(`Carrera ${Math.ceil(index / 12)} · Ejemplar ${index} · número ${index} · estado declarado`);
  doc.end();
  await once(doc, 'end');
  return Buffer.concat(chunks);
}

function providerFixture(volume: number) {
  const competitors = Array.from({ length: volume }, (_, index) => `<competitor id="sr:competitor:${index + 1}" name="RUNNER ${index + 1}" number="${index + 1}"/>`).join('');
  return {
    provider: 'sportradar-uof' as const,
    stageId: String(700000 + volume),
    fetchedAt: '2026-09-11T20:00:01.000Z',
    contentType: 'application/xml',
    xml: `<?xml version="1.0"?><stage_summary generated_at="2026-09-11T20:00:00.000Z"><sport_event id="sr:stage:${700000 + volume}" scheduled="2026-09-11T20:05:00.000Z" name="Perf ${volume}"><competitors>${competitors}</competitors></sport_event><sport_event_status status="open"/></stage_summary>`,
    cached: false
  };
}

function memorySnapshot() {
  const value = process.memoryUsage();
  return { rssBytes: value.rss, heapTotalBytes: value.heapTotal, heapUsedBytes: value.heapUsed, externalBytes: value.external, arrayBuffersBytes: value.arrayBuffers };
}

async function providerRequestProfile(volume: number) {
  const fixture = providerFixture(volume);
  let fetchCalls = 0;
  const upstream = createHorseRaceProvider({
    env: {
      HIPICO_RACE_PROVIDER: 'sportradar-uof',
      HIPICO_RACE_PROVIDER_BASE_URL: 'https://api.sportradar.com',
      HIPICO_SPORTRADAR_UOF_TOKEN: 'qa-performance-token',
      HIPICO_RACE_PROVIDER_TIMEOUT_MS: '5000',
      HIPICO_RACE_PROVIDER_CACHE_TTL_MS: '30000'
    },
    resolveImpl: async () => [{ address: '8.8.8.8', family: 4 }],
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(fixture.xml, { status: 200, headers: { 'content-type': 'application/xml' } });
    },
    now: () => Date.parse(fixture.fetchedAt)
  });
  const provider = createSportradarRacingProvider(upstream);
  const start = performance.now();
  const race = await provider.getRace(fixture.stageId);
  const requestPathMs = performance.now() - start;
  assert.equal(fetchCalls, 1);
  assert.equal(race.data.runners.length, volume);
  assert.equal(race.provenance.financialAuthority, false);
  return { requestPathMs, fetchCalls, runners: race.data.runners.length };
}

requireIsolatedDatabase();
const capability = documentExtractorCapability(process.env);
assert.equal(capability.nativeText, true, `native PDF runtime unavailable: ${capability.reason || 'unknown'}`);
const extractor = createPdfJsDocumentExtractor(process.env);
assert.ok(extractor, 'native PDF extractor must be configured in production performance gate');

const client = new Client({ connectionString: databaseUrl });
await client.connect();
const evidenceStore = new ProviderEvidenceStore();
const profiles: any[] = [];
try {
  for (const volume of volumes) {
    const groupKey = `perf-${volume}`;
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

    const planRows = await client.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT external_message_id,received_at FROM public.hipico_messages WHERE owner_id=$1::uuid AND channel_key=$2 ORDER BY received_at DESC LIMIT 50`, [OWNER_ID, groupKey]);
    const plan = planRows.rows[0]['QUERY PLAN']?.[0];

    const fixture=providerFixture(volume);
    const providerStart = performance.now();
    const providerNormalized = normalizeSportradarStage(fixture);
    const providerNormalizeMs = performance.now() - providerStart;
    assert.equal(providerNormalized.data.runners.length, volume);
    assert.equal(providerNormalized.provenance.financialAuthority, false);
    const providerRequest = await providerRequestProfile(volume);
    const firstEvidence=await evidenceStore.record({ownerId:OWNER_ID,groupKey,capability:'getRace',externalId:fixture.stageId,record:providerNormalized});
    const duplicateEvidence=await evidenceStore.record({ownerId:OWNER_ID,groupKey,capability:'getRace',externalId:fixture.stageId,record:providerNormalized});
    assert.equal(firstEvidence.id,duplicateEvidence.id,'exact provider observation must be idempotent');
    assert.equal(firstEvidence.financialAuthority,false);
    assert.match(firstEvidence.payloadHash,/^[a-f0-9]{64}$/);
    const scopedEvidence=await evidenceStore.recent(OWNER_ID,groupKey,20);
    assert.ok(scopedEvidence.some((row:any)=>row.id===firstEvidence.id));
    assert.ok(scopedEvidence.every((row:any)=>row.financialAuthority===false));
    assert.ok(scopedEvidence.every((row:any)=>!JSON.stringify(row.normalized).includes('<stage_summary')),'raw provider XML must never be persisted');

    const pdf = await pdfBuffer(volume);
    const pdfStart = performance.now();
    const extracted = await extractor.extract(pdf, new AbortController().signal);
    const pdfNativeParseMs = performance.now() - pdfStart;
    assert.equal(extracted.method, 'native_text');
    assert.ok(extracted.text.includes(`PERF ${volume}`));

    const memoryAfter = memorySnapshot();
    profiles.push({
      volume,
      postgres: {
        insertMs: Number(insertMs.toFixed(3)), countMs: Number(countMs.toFixed(3)), recent50Ms: Number(recent50Ms.toFixed(3)),
        plannerExecutionMs: plan?.['Execution Time'] ?? null, plannerPlanningMs: plan?.['Planning Time'] ?? null, plan: plan?.Plan ?? null
      },
      providerAdapter: {
        normalizationMs: Number(providerNormalizeMs.toFixed(3)),
        requestPathMs: Number(providerRequest.requestPathMs.toFixed(3)),
        normalizedRunners: providerNormalized.data.runners.length,
        injectedFetchCalls: providerRequest.fetchCalls,
        evidenceId:firstEvidence.id,
        evidencePayloadHash:firstEvidence.payloadHash,
        upstreamTransport: { status: 'NOT_EXECUTED', reason: 'EXTERNAL_PROVIDER_NETWORK_AND_CREDENTIALS_ARE_NOT_REQUIRED_FOR_PR_GATE' },
        financialAuthority: false
      },
      pdf: { bytes: pdf.byteLength, nativeParseMs: Number(pdfNativeParseMs.toFixed(3)), pages: extracted.pageCount || null, parserVersion: extracted.parserVersion },
      processMemory: {
        before: memoryBefore, after: memoryAfter,
        rssDeltaBytes: memoryAfter.rssBytes - memoryBefore.rssBytes,
        heapUsedDeltaBytes: memoryAfter.heapUsedBytes - memoryBefore.heapUsedBytes
      }
    });
  }

  const isolationA=await evidenceStore.recent(OWNER_ID,'perf-100',200);
  const isolationB=await evidenceStore.recent(OWNER_ID,'perf-500',200);
  assert.ok(isolationA.length>=1&&isolationB.length>=1);
  assert.equal(isolationA.some((left:any)=>isolationB.some((right:any)=>right.id===left.id)),false,'provider evidence crossed group scope');

  const host = {
    platform: process.platform, arch: process.arch, node: process.version,
    cpuCount: os.cpus().length, cpuModel: os.cpus()[0]?.model || 'unknown', totalMemoryBytes: os.totalmem(),
    targetProfile: 'Intel Core i5 6th generation / 16 GB RAM',
    equivalence: 'CI measurement only; physical target-device benchmark remains separate evidence when hardware is available.'
  };
  await fs.mkdir(path.dirname(artifact), { recursive: true });
  await fs.writeFile(artifact, `${JSON.stringify({
    schema: 'hipico-performance.v290', sha: SHA, database: 'isolated-ephemeral', pdfRuntime: capability.parserVersion,
    measuredAt: new Date().toISOString(), host, profiles
  }, null, 2)}\n`, 'utf8');
  console.log(`[hipico-v290] performance profiles measured: ${volumes.join('/')} operations`);
} finally {
  await client.end();
}
