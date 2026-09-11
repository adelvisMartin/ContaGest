import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test, after } from 'node:test';
import PDFDocument from 'pdfkit';
import { prisma } from '../../database/prisma.js';
import { TestChannelAdapter, type NormalizedChannelMessage } from './messaging-channel.js';
import { HipicoBotStore, processIncoming } from '../hipico-bot/hipico-bot.service.js';
import { DocumentIngestionService, validatePdfEnvelope } from './document-engine.js';
import { createPdfJsDocumentExtractor, documentExtractorCapability } from './document-extractor.js';
import { PostgresDocumentStore } from './document.store.js';
import { RaceLifecycleStore } from './race.store.js';
import { AutomationStore } from './automation.store.js';
import type { AgentCandidate } from './agent-policy.js';

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

after(async () => {
  await prisma.$disconnect();
});

async function pdfBuffer(configure: (doc: PDFKit.PDFDocument) => void) {
  const doc = new PDFDocument({ autoFirstPage: true, compress: false, info: { Title: 'Control Hipico E2E' } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  configure(doc);
  doc.end();
  await once(doc, 'end');
  return Buffer.concat(chunks);
}

const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3q2pWQAAAABJRU5ErkJggg==',
  'base64'
);

function botMessage(message: NormalizedChannelMessage) {
  return {
    providerMessageId: message.externalMessageId,
    phoneNumberId: 'test-channel',
    sender: message.senderId,
    messageType: message.type,
    body: message.text,
    payload: { groupId: message.groupId, historySync: message.historySync, channel: message.channel }
  };
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
  assert.ok(result?.duplicate, 'exact replay must be classified as duplicate');
  assert.equal(await rowCount('HipicoWebhookEvent'), beforeEvents + 1, 'replay must not create another event');
  assert.equal(await rowCount('HipicoBotOutbox'), beforeOutbox + 1, 'replay must not create another response');
  assert.equal(channel.sent.length, 1, 'replay must not send a second response');
  unsubscribe();
  await channel.disconnect();
});

test('document engine rejects corrupt, hostile and oversized PDFs before persistence', async () => {
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
  const storedRevision = rows.find((row: any) => row.id === revision.id);
  assert.equal(storedRevision?.supersedesId, first.id);
});

test('native PDF extraction uses real PDF.js and does not grant official authority from document wording', async () => {
  const capability = documentExtractorCapability(process.env);
  assert.equal(capability.nativeText, true, `native PDF dependency missing: ${capability.reason || 'unknown'}`);
  const extractor = createPdfJsDocumentExtractor(process.env);
  assert.ok(extractor);
  const pdf = await pdfBuffer((doc) => doc.fontSize(20).text('RESULTADO OFICIAL CARRERA 4 LLEGADA 3 1 5'));
  const store = new PostgresDocumentStore();
  const service = new DocumentIngestionService(store, extractor, 20_000);
  const result = await service.ingest({
    ownerId: OWNER_ID, groupKey: GROUP_A, pdf, filename: 'resultado-grupo.pdf',
    provenance: { sourceChannel: 'test-channel', sourceMessageId: `native-${Date.now()}`, sender: 'grupo', receivedAt: new Date().toISOString(), authority: 'group_evidence' }
  });
  assert.equal(result.extractionStatus, 'extracted');
  assert.equal(result.classification, 'RESULT', 'untrusted wording must not promote itself to OFFICIAL_RESULT');
  const stored: any = await store.get(OWNER_ID, GROUP_A, result.id);
  assert.equal(stored?.extraction?.method, 'native_text');
  assert.equal(stored?.extraction?.claimedOfficial, true);
});

test('scanned PDF follows real OCR fallback when OCR capability is enabled', async () => {
  const env = { ...process.env, HIPICO_DOCUMENT_OCR_ENABLED: 'true', HIPICO_DOCUMENT_OCR_LANGUAGE: process.env.HIPICO_DOCUMENT_OCR_LANGUAGE || 'eng' };
  const capability = documentExtractorCapability(env);
  assert.equal(capability.ocr, true, `OCR dependencies missing: ${capability.reason || 'OCR_NOT_READY'}`);
  const extractor = createPdfJsDocumentExtractor(env);
  assert.ok(extractor);
  const scanned = await pdfBuffer((doc) => { doc.image(PIXEL_PNG, 72, 72, { width: 320, height: 180 }); });
  const controller = new AbortController();
  const extracted = await extractor.extract(scanned, controller.signal);
  assert.equal(extracted.method, 'ocr');
  assert.equal(extracted.pageCount, 1);
});

function command(command: any, expectedState: any, requestId: string, payload: Record<string, unknown> = {}, evidence: any[] = []) {
  return { command, expectedState, requestId, actorId: 'operator-e2e', actorType: 'operator' as const, correlationId: `corr-${requestId}`, payload, evidence };
}

test('race lifecycle persists DISCOVERED -> OPEN -> CLOSED -> PROVISIONAL_RESULT -> OFFICIAL_RESULT', async () => {
  const store = new RaceLifecycleStore();
  const meeting = await store.createMeeting({ ownerId: OWNER_ID, groupKey: GROUP_A, name: 'Meeting E2E', meetingDate: new Date().toISOString() });
  const race = await store.createRace({ ownerId: OWNER_ID, groupKey: GROUP_A, meetingId: meeting.id, number: 4, name: 'Carrera 4 E2E' });
  assert.equal(race.state, 'DISCOVERED');
  const open = await store.command(OWNER_ID, GROUP_A, race.id, command('OPEN', 'DISCOVERED', 'req-open-290'));
  assert.equal(open.transition.to, 'OPEN');
  const close = await store.command(OWNER_ID, GROUP_A, race.id, command('CLOSE', 'OPEN', 'req-close-290'));
  assert.equal(close.transition.to, 'CLOSED');
  const provisional = await store.command(OWNER_ID, GROUP_A, race.id, command('RECORD_PROVISIONAL_RESULT', 'CLOSED', 'req-prov-290', { order: [3, 1, 5] }, [{ source: 'arrival-board', authority: 'trusted', confidence: 0.95 }]));
  assert.equal(provisional.transition.to, 'PROVISIONAL_RESULT');
  const official = await store.command(OWNER_ID, GROUP_A, race.id, command('MARK_OFFICIAL_RESULT', 'PROVISIONAL_RESULT', 'req-official-290', { order: [3, 1, 5] }, [{ source: 'official-provider', authority: 'official', confidence: 0.99 }]));
  assert.equal(official.transition.to, 'OFFICIAL_RESULT');
  const persisted = await store.getRace(OWNER_ID, GROUP_A, race.id);
  assert.equal(persisted?.state, 'OFFICIAL_RESULT');
  assert.equal(persisted?.resultStage, 'official');
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
  const candidate: AgentCandidate = { intent: 'status_non_monetary', confidence: 0.99, risk: 'safe', tool: 'queryRaceStatus', args: {}, source: 'deterministic' };
  const evaluation = await store.recordEvaluation({ ownerId: OWNER_ID, groupKey: GROUP_A, groupId: SOURCE_GROUP_ID, text: 'estatus de la carrera', candidate, canAct: false, evidence: { source: 'e2e' } });
  assert.ok(evaluation.id);
  const rows = await store.evaluations(OWNER_ID, GROUP_A, SOURCE_GROUP_ID, 10);
  assert.equal(rows.find((row: any) => row.id === evaluation.id)?.canAct, false);
  const afterRows = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM public.hipico_ledger_entries WHERE owner_id=${OWNER_ID}::uuid`;
  assert.equal(Number(afterRows[0]?.count || 0), Number(before[0]?.count || 0));
});
