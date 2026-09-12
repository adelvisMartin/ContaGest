import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, after } from 'node:test';
import { promisify } from 'node:util';
import PDFDocument from 'pdfkit';
import { prisma } from '../../database/prisma.js';
import { TestChannelAdapter, type NormalizedChannelMessage } from './messaging-channel.js';
import { HipicoBotStore, processIncoming } from '../hipico-bot/hipico-bot.service.js';
import { DocumentIngestionService, validatePdfEnvelope } from './document-engine.js';
import { createPdfJsDocumentExtractor, documentExtractorCapability } from './document-extractor.js';
import { PostgresDocumentStore } from './document.store.js';
import { RaceLifecycleStore } from './race.store.js';
import { AutomationStore } from './automation.store.js';
import { buildHipicoCommandCenter } from './command-center.service.js';
import type { AgentCandidate } from './agent-policy.js';

const execFileAsync = promisify(execFile);
const OWNER_ID = process.env.HIPICO_E2E_OWNER_ID || '11111111-1111-4111-8111-111111111111';
const GROUP_A = 'e2e-group-a';
const GROUP_B = 'e2e-group-b';
const SOURCE_GROUP_ID = process.env.HIPICO_SOURCE_GROUP_ID || '120363099999999999@g.us';
const databaseUrl = String(process.env.HIPICO_E2E_DATABASE_URL || '').trim();

function requireIsolatedDatabase() {
  assert.ok(databaseUrl, 'HIPICO_E2E_DATABASE_URL is required for production E2E');
  const url = new URL(databaseUrl);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase()), 'E2E PostgreSQL must be local/ephemeral');
  assert.match(url.pathname.replace(/^\//, ''), /^hipico_e2e_[a-z0-9_]{8,63}$/, 'E2E PostgreSQL must use hipico_e2e_ run isolation');
}
requireIsolatedDatabase();

after(async () => { await prisma.$disconnect(); });

async function pdfBuffer(configure: (doc: PDFKit.PDFDocument) => void) {
  const doc = new PDFDocument({ autoFirstPage: true, compress: false, info: { Title: 'Control Hipico E2E' } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  configure(doc);
  doc.end();
  await once(doc, 'end');
  return Buffer.concat(chunks);
}

async function scannedPdfBuffer(text: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hipico-e2e-scan-'));
  const sourcePath = path.join(directory, 'source.pdf');
  const imagePrefix = path.join(directory, 'scan');
  try {
    const source = await pdfBuffer((doc) => {
      doc.fontSize(30).text(text, 72, 150, { width: 460, align: 'center' });
    });
    await fs.writeFile(sourcePath, source, { mode: 0o600 });
    await execFileAsync('pdftoppm', ['-f', '1', '-singlefile', '-png', '-r', '200', sourcePath, imagePrefix], {
      timeout: 20_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' }
    });
    const image = await fs.readFile(`${imagePrefix}.png`);
    return pdfBuffer((doc) => {
      doc.image(image, 36, 72, { fit: [doc.page.width - 72, doc.page.height - 144], align: 'center', valign: 'center' });
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function botMessage(message: NormalizedChannelMessage) {
  return { providerMessageId: message.externalMessageId, phoneNumberId: 'test-channel', sender: message.senderId, messageType: message.type, body: message.text, payload: { groupId: message.groupId, historySync: message.historySync, channel: message.channel } };
}

async function rowCount(table: 'HipicoWebhookEvent' | 'HipicoBotOutbox') {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM public."${table}"`);
  return Number(rows[0]?.count || 0);
}

test('TestChannel -> normalization/classification -> PostgreSQL -> response is persistent and replay-safe', async () => {
  assert.equal(await HipicoBotStore.dbReady(true), true, 'persistent PostgreSQL path is mandatory; memory fallback is forbidden');
  const channel = new TestChannelAdapter('production-e2e');
  await channel.connect();
  const beforeEvents = await rowCount('HipicoWebhookEvent');
  const beforeOutbox = await rowCount('HipicoBotOutbox');
  let result: Awaited<ReturnType<typeof processIncoming>> | null = null;
  const unsubscribe = channel.receive(async (message) => {
    result = await processIncoming(botMessage(message));
    if (!result.duplicate && result.outbox?.message) await channel.send(message.groupId, result.outbox.message);
  });
  const inbound: NormalizedChannelMessage = {
    channel: 'production-e2e', groupId: GROUP_A, externalMessageId: `e2e-${Date.now()}-status`,
    senderId: '584121234567', senderLabel: 'Operador E2E', sentAt: new Date().toISOString(), type: 'text',
    text: 'estatus', quotedExternalMessageId: null, historySync: false, fromMe: false, hasMedia: false
  };
  await channel.inject(inbound);
  assert.ok(result && !result.duplicate);
  assert.equal(await rowCount('HipicoWebhookEvent'), beforeEvents + 1);
  assert.equal(await rowCount('HipicoBotOutbox'), beforeOutbox + 1);
  assert.equal(channel.sent.length, 1);
  assert.equal(channel.sent[0].groupId, GROUP_A);
  assert.ok(channel.sent[0].text.trim().length > 0);
  await channel.inject(inbound);
  assert.ok(result?.duplicate);
  assert.equal(await rowCount('HipicoWebhookEvent'), beforeEvents + 1);
  assert.equal(await rowCount('HipicoBotOutbox'), beforeOutbox + 1);
  assert.equal(channel.sent.length, 1);
  unsubscribe();
  await channel.disconnect();
});

test('document engine rejects corrupt hostile and oversized PDFs before persistence', async () => {
  assert.throws(() => validatePdfEnvelope(Buffer.from('not-a-pdf'), 'corrupt.pdf'), /PDF_MAGIC_INVALID/);
  const hostile = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /OpenAction 2 0 R >> endobj\n2 0 obj << /JavaScript (alert) >> endobj\n%%EOF\n', 'latin1');
  assert.throws(() => validatePdfEnvelope(hostile, 'hostile.pdf'), /PDF_ACTIVE_CONTENT_REJECTED/);
  const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0x20);
  oversized.write('%PDF-1.4', 0, 'latin1');
  assert.throws(() => validatePdfEnvelope(oversized, 'oversized.pdf'), /PDF_TOO_LARGE/);
});

test('document persistence deduplicates exact bytes and links immutable revisions per group', async () => {
  const store = new PostgresDocumentStore();
  const service = new DocumentIngestionService(store, null);
  const firstPdf = await pdfBuffer((doc) => doc.fontSize(18).text('PROGRAMA DE CARRERAS E2E A'));
  const provenance = { sourceChannel: 'test-channel', sourceMessageId: `doc-a-${Date.now()}`, sender: 'e2e', receivedAt: new Date().toISOString(), authority: 'group_evidence' as const };
  const first = await service.ingest({ ownerId: OWNER_ID, groupKey: GROUP_A, pdf: firstPdf, filename: 'programa-a.pdf', provenance });
  assert.equal(first.duplicate, false);
  const duplicate = await service.ingest({ ownerId: OWNER_ID, groupKey: GROUP_A, pdf: firstPdf, filename: 'programa-copy.pdf', provenance: { ...provenance, sourceMessageId: `doc-a-copy-${Date.now()}` } });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.id, first.id);
  const revisionPdf = await pdfBuffer((doc) => doc.fontSize(18).text('PROGRAMA DE CARRERAS E2E A REVISION 2'));
  const revision = await service.ingest({ ownerId: OWNER_ID, groupKey: GROUP_A, pdf: revisionPdf, filename: 'programa-a-r2.pdf', supersedesId: first.id, provenance: { ...provenance, sourceMessageId: `doc-a-r2-${Date.now()}` } });
  assert.equal(revision.duplicate, false);
  assert.notEqual(revision.id, first.id);
  const rows = await store.list(OWNER_ID, GROUP_A, 20);
  assert.equal(rows.find((row: any) => row.id === revision.id)?.supersedesId, first.id);
});

test('native PDF extraction uses real Poppler and does not grant official authority from wording', async () => {
  const capability = documentExtractorCapability(process.env);
  assert.equal(capability.nativeText, true, `native PDF runtime missing: ${capability.reason || 'unknown'}`);
  const extractor = createPdfJsDocumentExtractor(process.env);
  assert.ok(extractor);
  const pdf = await pdfBuffer((doc) => doc.fontSize(20).text('RESULTADO OFICIAL CARRERA 4 LLEGADA 3 1 5'));
  const store = new PostgresDocumentStore();
  const service = new DocumentIngestionService(store, extractor, 20_000);
  const result = await service.ingest({ ownerId: OWNER_ID, groupKey: GROUP_A, pdf, filename: 'resultado-grupo.pdf', provenance: { sourceChannel: 'test-channel', sourceMessageId: `native-${Date.now()}`, sender: 'grupo', receivedAt: new Date().toISOString(), authority: 'group_evidence' } });
  assert.equal(result.extractionStatus, 'extracted');
  assert.equal(result.classification, 'RESULT');
  const stored: any = await store.get(OWNER_ID, GROUP_A, result.id);
  assert.equal(stored?.extraction?.method, 'native_text');
  assert.equal(stored?.extraction?.claimedOfficial, true);
});

test('scanned PDF uses real rasterization plus OCR and recovers semantic text', async () => {
  const env = { ...process.env, HIPICO_DOCUMENT_OCR_ENABLED: 'true', HIPICO_DOCUMENT_OCR_LANGUAGE: process.env.HIPICO_DOCUMENT_OCR_LANGUAGE || 'eng' };
  const capability = documentExtractorCapability(env);
  assert.equal(capability.ocr, true, `OCR dependencies missing: ${capability.reason || 'OCR_NOT_READY'}`);
  const extractor = createPdfJsDocumentExtractor(env);
  assert.ok(extractor);
  const scanned = await scannedPdfBuffer('RESULTADO OFICIAL CARRERA 4');
  const extracted = await extractor.extract(scanned, new AbortController().signal);
  assert.equal(extracted.method, 'ocr');
  assert.equal(extracted.pageCount, 1);
  assert.match(extracted.text.toUpperCase(), /RESULTADO/);
  assert.match(extracted.text.toUpperCase(), /CARRERA/);
});

function command(command: any, expectedState: any, requestId: string, payload: Record<string, unknown> = {}, evidence: any[] = []) {
  return { command, expectedState, requestId, actorId: 'operator-e2e', actorType: 'operator' as const, correlationId: `corr-${requestId}`, payload, evidence };
}

test('race lifecycle persists DISCOVERED -> OPEN -> CLOSED -> PROVISIONAL_RESULT -> OFFICIAL_RESULT', async () => {
  const store = new RaceLifecycleStore();
  const meeting = await store.createMeeting({ ownerId: OWNER_ID, groupKey: GROUP_A, name: 'Meeting E2E', meetingDate: new Date().toISOString() });
  const race = await store.createRace({ ownerId: OWNER_ID, groupKey: GROUP_A, meetingId: meeting.id, number: 4, name: 'Carrera 4 E2E' });
  assert.equal(race.state, 'DISCOVERED');
  assert.equal((await store.command(OWNER_ID, GROUP_A, race.id, command('OPEN', 'DISCOVERED', 'req-open-290'))).transition.to, 'OPEN');
  assert.equal((await store.command(OWNER_ID, GROUP_A, race.id, command('CLOSE', 'OPEN', 'req-close-290'))).transition.to, 'CLOSED');
  assert.equal((await store.command(OWNER_ID, GROUP_A, race.id, command('RECORD_PROVISIONAL_RESULT', 'CLOSED', 'req-prov-290', { order: [3, 1, 5] }, [{ source: 'arrival-board', authority: 'trusted', confidence: 0.95 }]))).transition.to, 'PROVISIONAL_RESULT');
  assert.equal((await store.command(OWNER_ID, GROUP_A, race.id, command('MARK_OFFICIAL_RESULT', 'PROVISIONAL_RESULT', 'req-official-290', { order: [3, 1, 5] }, [{ source: 'official-provider', authority: 'official', confidence: 0.99 }]))).transition.to, 'OFFICIAL_RESULT');
  const persisted = await store.getRace(OWNER_ID, GROUP_A, race.id);
  assert.equal(persisted?.state, 'OFFICIAL_RESULT');
  assert.equal(persisted?.resultStage, 'official');
});

test('PostgreSQL lifecycle persists SUSPEND and RESUME restores the exact prior state from audit history', async () => {
  const store = new RaceLifecycleStore();
  const meeting = await store.createMeeting({ ownerId: OWNER_ID, groupKey: GROUP_A, name: 'Meeting Suspend Resume E2E', meetingDate: new Date().toISOString() });
  const race = await store.createRace({ ownerId: OWNER_ID, groupKey: GROUP_A, meetingId: meeting.id, number: 9, name: 'Carrera Suspend Resume E2E' });

  const opened = await store.command(OWNER_ID, GROUP_A, race.id, command('OPEN', 'DISCOVERED', 'req-sr-open-290'));
  assert.equal(opened.transition.to, 'OPEN');

  const suspended = await store.command(OWNER_ID, GROUP_A, race.id, command('SUSPEND', 'OPEN', 'req-sr-suspend-290'));
  assert.equal(suspended.transition.from, 'OPEN');
  assert.equal(suspended.transition.to, 'SUSPENDED');
  const persistedSuspended = await store.getRace(OWNER_ID, GROUP_A, race.id);
  assert.equal(persistedSuspended?.state, 'SUSPENDED');
  assert.equal(persistedSuspended?.stateVersion, 2);

  const resumed = await store.command(OWNER_ID, GROUP_A, race.id, command('RESUME', 'SUSPENDED', 'req-sr-resume-290'));
  assert.equal(resumed.transition.from, 'SUSPENDED');
  assert.equal(resumed.transition.to, 'OPEN');
  const persistedResumed = await store.getRace(OWNER_ID, GROUP_A, race.id);
  assert.equal(persistedResumed?.state, 'OPEN');
  assert.equal(persistedResumed?.stateVersion, 3);

  const history = await store.history(OWNER_ID, GROUP_A, race.id);
  const suspendEvent = history.find((event: any) => event.requestId === 'req-sr-suspend-290');
  const resumeEvent = history.find((event: any) => event.requestId === 'req-sr-resume-290');
  assert.deepEqual(
    { command: suspendEvent?.command, fromState: suspendEvent?.fromState, toState: suspendEvent?.toState, disposition: suspendEvent?.disposition },
    { command: 'SUSPEND', fromState: 'OPEN', toState: 'SUSPENDED', disposition: 'applied' }
  );
  assert.deepEqual(
    { command: resumeEvent?.command, fromState: resumeEvent?.fromState, toState: resumeEvent?.toState, disposition: resumeEvent?.disposition },
    { command: 'RESUME', fromState: 'SUSPENDED', toState: 'OPEN', disposition: 'applied' }
  );
});

test('multi-group A/B concurrent writes have zero cross-group reads', async () => {
  const store = new RaceLifecycleStore();
  const [meetingA, meetingB] = await Promise.all([
    store.createMeeting({ ownerId: OWNER_ID, groupKey: GROUP_A, name: 'Meeting A' }),
    store.createMeeting({ ownerId: OWNER_ID, groupKey: GROUP_B, name: 'Meeting B' })
  ]);
  const [raceA, raceB] = await Promise.all([
    store.createRace({ ownerId: OWNER_ID, groupKey: GROUP_A, meetingId: meetingA.id, number: 1, name: 'A-1' }),
    store.createRace({ ownerId: OWNER_ID, groupKey: GROUP_B, meetingId: meetingB.id, number: 1, name: 'B-1' })
  ]);
  await Promise.all([
    store.command(OWNER_ID, GROUP_A, raceA.id, command('OPEN', 'DISCOVERED', 'req-a-open-290')),
    store.command(OWNER_ID, GROUP_B, raceB.id, command('OPEN', 'DISCOVERED', 'req-b-open-290'))
  ]);
  const [rowsA, rowsB] = await Promise.all([store.listRaces(OWNER_ID, GROUP_A), store.listRaces(OWNER_ID, GROUP_B)]);
  assert.ok(rowsA.some((row: any) => row.id === raceA.id));
  assert.ok(!rowsA.some((row: any) => row.id === raceB.id));
  assert.ok(rowsB.some((row: any) => row.id === raceB.id));
  assert.ok(!rowsB.some((row: any) => row.id === raceA.id));
  assert.equal(await store.getRace(OWNER_ID, GROUP_B, raceA.id), null);
  assert.equal(await store.getRace(OWNER_ID, GROUP_A, raceB.id), null);
});

test('agent source group remains shadow-only and persists evaluation without ledger mutation', async () => {
  process.env.HIPICO_SOURCE_GROUP_ID = SOURCE_GROUP_ID;
  const store = new AutomationStore();
  const before = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM public.hipico_ledger_entries WHERE owner_id=${OWNER_ID}::uuid`;
  const state = await store.get(OWNER_ID, GROUP_A, SOURCE_GROUP_ID);
  assert.equal(state.mode, 'SHADOW');
  const candidate: AgentCandidate = { intent: 'status_non_monetary', confidence: 0.99, risk: 'safe', tool: 'queryRaceStatus', arguments: {}, source: 'deterministic', modelVersion: null };
  const evaluation = await store.recordEvaluation({ ownerId: OWNER_ID, groupKey: GROUP_A, groupId: SOURCE_GROUP_ID, text: 'estatus de la carrera', candidate, canAct: false, evidence: { source: 'e2e' } });
  assert.ok(evaluation.id);
  const rows = await store.evaluations(OWNER_ID, GROUP_A, SOURCE_GROUP_ID, 10);
  assert.equal(rows.find((row: any) => row.id === evaluation.id)?.canAct, false);
  const afterRows = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM public.hipico_ledger_entries WHERE owner_id=${OWNER_ID}::uuid`;
  assert.equal(Number(afterRows[0]?.count || 0), Number(before[0]?.count || 0));
});

test('Command Center is read-only and isolates channels plus bridge freshness per group', async () => {
  process.env.HIPICO_SOURCE_GROUP_ID = SOURCE_GROUP_ID;
  const channelRows = await prisma.$queryRaw<Array<{ id: string; groupKey: string }>>`
    INSERT INTO public.hipico_bot_channels(owner_id,group_key,label,channel_type,status,config)
    VALUES
      (${OWNER_ID}::uuid,${GROUP_A},'E2E A','web_bridge','active','{"mode":"shadow_only"}'::jsonb),
      (${OWNER_ID}::uuid,${GROUP_B},'E2E B','web_bridge','active','{"mode":"shadow_only"}'::jsonb)
    ON CONFLICT(owner_id,group_key) DO UPDATE SET status='active',updated_at=now()
    RETURNING id::text AS id,group_key AS "groupKey"`;
  const channelA = channelRows.find((row) => row.groupKey === GROUP_A);
  const channelB = channelRows.find((row) => row.groupKey === GROUP_B);
  assert.ok(channelA && channelB);
  const bridgeAId = `cc-a-${Date.now()}`;
  const bridgeBId = `cc-b-${Date.now()}`;
  await prisma.$executeRaw`
    INSERT INTO public.hipico_messages(
      owner_id,channel_id,channel_key,external_message_id,fingerprint,sender_id,sender_label,sender_role,
      sent_at,message_type,raw_text,classification,confidence,processing_status,normalized,metadata,created_at,received_at)
    VALUES
      (${OWNER_ID}::uuid,${channelA!.id}::uuid,${GROUP_A},${bridgeAId},md5(${bridgeAId}),'bridge-a','Bridge A','system',now()-interval '10 minutes','text','bridge a','status_non_monetary',1,'processed','{}'::jsonb,'{"source":"whatsapp-web-bridge"}'::jsonb,now()-interval '10 minutes',now()-interval '10 minutes'),
      (${OWNER_ID}::uuid,${channelB!.id}::uuid,${GROUP_B},${bridgeBId},md5(${bridgeBId}),'bridge-b','Bridge B','system',now(),'text','bridge b','status_non_monetary',1,'processed','{}'::jsonb,'{"source":"whatsapp-web-bridge"}'::jsonb,now(),now())`;
  const expectedA = await prisma.$queryRaw<Array<{ createdAt: Date }>>`
    SELECT created_at AS "createdAt" FROM public.hipico_messages
    WHERE owner_id=${OWNER_ID}::uuid AND channel_key=${GROUP_A} AND external_message_id=${bridgeAId} LIMIT 1`;
  const beforeLedger = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM public.hipico_ledger_entries WHERE owner_id=${OWNER_ID}::uuid`;
  const [dataA, dataB] = await Promise.all([
    buildHipicoCommandCenter({ ownerId: OWNER_ID, groupKey: GROUP_A, groupId: SOURCE_GROUP_ID }),
    buildHipicoCommandCenter({ ownerId: OWNER_ID, groupKey: GROUP_B, groupId: SOURCE_GROUP_ID })
  ]);
  assert.equal(dataA.scope.groupKey, GROUP_A);
  assert.ok(dataA.system.components.database);
  assert.ok(dataA.operation.raceCount >= 1);
  assert.ok(Array.isArray(dataA.documents.recent));
  assert.equal(dataA.bridge.sourceSendPossible, false);
  assert.equal(dataA.agent.mode, 'SHADOW');
  assert.ok(dataA.channels.every((channel: any) => channel.groupKey === GROUP_A));
  assert.ok(dataB.channels.every((channel: any) => channel.groupKey === GROUP_B));
  assert.equal(dataA.channels.some((channel: any) => channel.groupKey === GROUP_B), false);
  assert.equal(dataB.channels.some((channel: any) => channel.groupKey === GROUP_A), false);
  assert.equal(dataA.bridge.lastEventAt, expectedA[0]?.createdAt.toISOString());
  assert.notEqual(dataA.bridge.lastEventAt, dataB.bridge.lastEventAt);
  const afterLedger = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM public.hipico_ledger_entries WHERE owner_id=${OWNER_ID}::uuid`;
  assert.equal(Number(afterLedger[0]?.count || 0), Number(beforeLedger[0]?.count || 0));
});
