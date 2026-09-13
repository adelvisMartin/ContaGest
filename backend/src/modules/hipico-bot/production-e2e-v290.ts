import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { after, test } from 'node:test';
import PDFDocument from 'pdfkit';
import { prisma } from '../../database/prisma.js';
import { HipicoBotStore, processIncoming } from './hipico-bot.service.js';
import { persistHipicoDomainEvent, hipicoDomainPersistenceReadiness } from './hipico-domain-event.store.js';
import { readHipicoDomainAggregate } from './hipico-domain-query.store.js';
import { DocumentIngestionService, MAX_PDF_BYTES, validatePdfEnvelope } from './hipico-document-engine.js';
import { createPdfDocumentExtractor, documentExtractorCapability } from './hipico-document-extractor.js';
import { PostgresDocumentStore } from './hipico-document.store.js';
import { TestChannelAdapter, type NormalizedChannelMessage } from './hipico-test-channel.js';

const execFileAsync = promisify(execFile);
const OWNER_ID = String(process.env.HIPICO_E2E_OWNER_ID || '11111111-1111-4111-8111-111111111111');
const DATABASE_URL = String(process.env.HIPICO_E2E_DATABASE_URL || process.env.DATABASE_URL || '').trim();
const runKey = `v290-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

function requireIsolatedDatabase() {
  assert.ok(DATABASE_URL, 'HIPICO_E2E_DATABASE_URL is required for production E2E');
  const url = new URL(DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase()), 'E2E PostgreSQL must be loopback-only');
  assert.match(url.pathname.replace(/^\//, ''), /^hipico_e2e_[a-z0-9_]{8,63}$/, 'E2E PostgreSQL must use a hipico_e2e_ database');
}

requireIsolatedDatabase();
after(async () => { await prisma.$disconnect(); });

function botMessage(message: NormalizedChannelMessage) {
  return {
    providerMessageId: message.externalMessageId,
    phoneNumberId: `test-channel:${message.channel}`,
    sender: message.senderId,
    messageType: message.type,
    body: message.text,
    payload: {
      groupId: message.groupId,
      historySync: message.historySync,
      channel: message.channel,
      quotedExternalMessageId: message.quotedExternalMessageId || null,
      sentAt: message.sentAt
    }
  };
}

async function countPrismaTable(table: 'HipicoWebhookEvent' | 'HipicoBotOutbox') {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM public."${table}"`);
  return Number(rows[0]?.count || 0);
}

function event(type: Parameters<typeof persistHipicoDomainEvent>[0]['event']['type'], key: string, payload: Record<string, unknown> = {}) {
  return {
    type,
    sourceMessageKey: key,
    sourceMessageId: key,
    rawMessage: type,
    normalizedPayload: payload,
    actorRef: 'e2e:operator',
    source: 'production_e2e',
    parserVersion: 'v290',
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    operatorConfirmed: true,
    confirmationReason: 'production e2e lifecycle validation'
  } as const;
}

async function appendRace(groupKey: string, aggregateKey: string, input: ReturnType<typeof event>) {
  return persistHipicoDomainEvent({ ownerId: OWNER_ID, groupKey, aggregateKind: 'race', aggregateKey, event: input });
}

async function pdfBuffer(text: string) {
  const doc = new PDFDocument({ autoFirstPage: true, compress: true, margin: 48, info: { Title: 'Control Hipico E2E' } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  doc.fontSize(24).text(text);
  doc.fontSize(14).text('Carrera 3 · Ejemplar UNO · evidencia de producción');
  doc.end();
  await once(doc, 'end');
  return Buffer.concat(chunks);
}

async function scannedPdfBuffer(text: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hipico-scan-fixture-'));
  try {
    const sourcePdf = path.join(directory, 'source.pdf');
    const imagePrefix = path.join(directory, 'page');
    const native = await pdfBuffer(text);
    await fs.writeFile(sourcePdf, native, { mode: 0o600 });
    await execFileAsync('pdftoppm', ['-singlefile', '-png', '-r', '220', sourcePdf, imagePrefix], { timeout: 30000, maxBuffer: 12 * 1024 * 1024, windowsHide: true });
    const imagePath = `${imagePrefix}.png`;
    const doc = new PDFDocument({ autoFirstPage: true, compress: true, margin: 0, info: { Title: 'Control Hipico Scan E2E' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.image(imagePath, 18, 18, { fit: [576, 756], align: 'center', valign: 'center' });
    doc.end();
    await once(doc, 'end');
    return Buffer.concat(chunks);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('TestChannel -> normalization/classification -> PostgreSQL -> response is persistent and replay-safe', async () => {
  assert.equal(await HipicoBotStore.dbReady(true), true, 'persistent PostgreSQL path is mandatory; memory fallback is forbidden');
  const channel = new TestChannelAdapter('production-e2e');
  await channel.connect();
  const beforeEvents = await countPrismaTable('HipicoWebhookEvent');
  const beforeOutbox = await countPrismaTable('HipicoBotOutbox');
  let result: any = null;
  const unsubscribe = channel.receive(async (message) => {
    result = await processIncoming(botMessage(message));
    if (!result?.duplicate && result?.outbox?.message) await channel.send(message.groupId, result.outbox.message);
  });
  const inbound: NormalizedChannelMessage = {
    channel: 'production-e2e',
    groupId: `${runKey}-group-a`,
    externalMessageId: `${runKey}-status`,
    senderId: '584121234567',
    senderLabel: 'Operador E2E',
    sentAt: new Date().toISOString(),
    type: 'text',
    text: 'estatus',
    quotedExternalMessageId: null,
    historySync: false,
    fromMe: false,
    hasMedia: false
  };

  await channel.inject(inbound);
  assert.ok(result && result.duplicate === false);
  assert.equal(await countPrismaTable('HipicoWebhookEvent'), beforeEvents + 1);
  assert.equal(await countPrismaTable('HipicoBotOutbox'), beforeOutbox + 1);
  assert.equal(channel.sent.length, 1);
  assert.equal(channel.sent[0].groupId, inbound.groupId);
  assert.ok(channel.sent[0].text.trim().length > 0);

  await channel.inject(inbound);
  assert.equal(result?.duplicate, true);
  assert.equal(await countPrismaTable('HipicoWebhookEvent'), beforeEvents + 1);
  assert.equal(await countPrismaTable('HipicoBotOutbox'), beforeOutbox + 1);
  assert.equal(channel.sent.length, 1);

  unsubscribe();
  await channel.disconnect();
});

test('canonical persistence is fully hardened in the isolated PostgreSQL database', async () => {
  const readiness = await hipicoDomainPersistenceReadiness();
  assert.deepEqual(readiness, {
    ready: true,
    tablesReady: true,
    confirmationAuditReady: true,
    sourceIdentityReady: true,
    aggregateFkReady: true,
    confirmationConstraintReady: true,
    immutableTriggerReady: true,
    rlsReady: true,
    authenticatedRoleReady: true,
    browserWritesRevoked: true
  });
});

test('native/scanned/invalid/oversized/duplicate/revision PDFs execute against the production document boundary', async () => {
  const capability = documentExtractorCapability({ ...process.env, HIPICO_DOCUMENT_OCR_ENABLED: 'true', HIPICO_DOCUMENT_OCR_LANGUAGE: 'eng' });
  assert.equal(capability.nativeText, true, `native PDF capability unavailable: ${capability.reason || 'unknown'}`);
  assert.equal(capability.ocr, true, `OCR PDF capability unavailable: ${capability.reason || 'unknown'}`);
  const extractor = createPdfDocumentExtractor({ ...process.env, HIPICO_DOCUMENT_OCR_ENABLED: 'true', HIPICO_DOCUMENT_OCR_LANGUAGE: 'eng' });
  assert.ok(extractor, 'document extractor must be configured in production E2E');
  const store = new PostgresDocumentStore();
  const service = new DocumentIngestionService(store, extractor, 30000);
  const groupKey = `${runKey}-docs`.slice(0, 120);

  const corrupt = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >>', 'latin1');
  assert.throws(() => validatePdfEnvelope(corrupt, 'corrupt.pdf'), (error: any) => error?.code === 'PDF_STRUCTURE_INVALID');
  const hostile = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page /OpenAction 2 0 R >>\nendobj\n%%EOF\n', 'latin1');
  assert.throws(() => validatePdfEnvelope(hostile, 'hostile.pdf'), (error: any) => error?.code === 'PDF_ACTIVE_CONTENT_REJECTED');
  const oversized = Buffer.alloc(MAX_PDF_BYTES + 1, 0x20);
  oversized.write('%PDF-1.4', 0, 'latin1');
  assert.throws(() => validatePdfEnvelope(oversized, 'oversized.pdf'), (error: any) => error?.code === 'PDF_TOO_LARGE');

  const native = await pdfBuffer('PROGRAMA OFICIAL DE CARRERAS');
  const nativeResult = await service.ingest({
    ownerId: OWNER_ID,
    groupKey,
    pdf: native,
    filename: 'programa.pdf',
    provenance: { sourceChannel: 'e2e', sourceMessageId: `${runKey}:doc:native`, sender: 'operator-e2e', receivedAt: new Date().toISOString(), authority: 'operator' }
  });
  assert.equal(nativeResult.duplicate, false);
  assert.equal(nativeResult.extractionStatus, 'extracted');
  assert.equal(nativeResult.classification, 'RACE_PROGRAM');
  const nativeRow = await store.get(OWNER_ID, groupKey, nativeResult.id);
  assert.equal(nativeRow?.extraction?.method, 'native_text');

  const duplicate = await service.ingest({
    ownerId: OWNER_ID,
    groupKey,
    pdf: native,
    filename: 'programa-copy.pdf',
    provenance: { sourceChannel: 'e2e', sourceMessageId: `${runKey}:doc:duplicate`, sender: 'operator-e2e', receivedAt: new Date().toISOString(), authority: 'operator' }
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.id, nativeResult.id);
  assert.equal((await store.sources(OWNER_ID, groupKey, nativeResult.id) as any[]).length, 2);

  const revisionPdf = await pdfBuffer('RESULTADO OFICIAL CARRERA 3');
  const revision = await service.ingest({
    ownerId: OWNER_ID,
    groupKey,
    pdf: revisionPdf,
    filename: 'resultado-revision.pdf',
    supersedesId: nativeResult.id,
    provenance: { sourceChannel: 'e2e', sourceMessageId: `${runKey}:doc:revision`, sender: 'group-source', receivedAt: new Date().toISOString(), authority: 'group_evidence' }
  });
  assert.equal(revision.duplicate, false);
  assert.equal(revision.classification, 'RESULT', 'untrusted official wording must not grant official authority');
  const revisionRow = await store.get(OWNER_ID, groupKey, revision.id);
  assert.equal(revisionRow?.supersedesId, nativeResult.id);
  assert.equal(revisionRow?.authority, 'group_evidence');
  assert.equal(revisionRow?.extraction?.claimedOfficial, true);

  await assert.rejects(
    prisma.$executeRaw`UPDATE public.hipico_documents SET raw_pdf=${Buffer.from('changed')} WHERE id=${revision.id}::uuid`,
    /HIPICO_DOCUMENT_IMMUTABLE_EVIDENCE/
  );

  const scanned = await scannedPdfBuffer('PIZARRA RESULTADO CARRERA CINCO TRES UNO');
  const scannedEnvelope = validatePdfEnvelope(scanned, 'scan.pdf');
  assert.ok(scannedEnvelope.sizeBytes > 0);
  const extractedScan = await extractor.extract(scanned, new AbortController().signal);
  assert.equal(extractedScan.method, 'ocr');
  assert.ok(extractedScan.text.replace(/\s/g, '').length >= 10, 'OCR scan must yield non-empty text');
});

test('race lifecycle reaches the current canonical equivalents of provisional/official result without closing as settlement', async () => {
  const groupKey = `${runKey}-lifecycle`;
  const aggregateKey = `${runKey}-race-1`;
  const opened = event('RACE_OPENED', `${aggregateKey}:open`, { raceKey: aggregateKey });
  const closed = event('RACE_CLOSED', `${aggregateKey}:close`, { raceKey: aggregateKey });
  const result = event('RESULT_RECORDED', `${aggregateKey}:result`, { raceKey: aggregateKey, resultStage: 'provisional' });
  const settlementReady = event('SETTLEMENT_READY', `${aggregateKey}:settlement-ready`, { raceKey: aggregateKey });
  const settled = event('SETTLEMENT_RECORDED', `${aggregateKey}:settled`, { raceKey: aggregateKey });
  const balanced = event('BALANCE_CONFIRMED', `${aggregateKey}:balanced`, { raceKey: aggregateKey });
  const published = event('RACE_PUBLISHED', `${aggregateKey}:official`, { raceKey: aggregateKey, resultStage: 'official' });

  assert.equal((await appendRace(groupKey, aggregateKey, opened)).nextState, 'OPEN');
  assert.equal((await appendRace(groupKey, aggregateKey, closed)).nextState, 'CLOSED');
  assert.equal((await appendRace(groupKey, aggregateKey, result)).nextState, 'RESULT_RECEIVED');
  assert.equal((await appendRace(groupKey, aggregateKey, settlementReady)).nextState, 'SETTLEMENT_READY');
  assert.equal((await appendRace(groupKey, aggregateKey, settled)).nextState, 'SETTLED');
  assert.equal((await appendRace(groupKey, aggregateKey, balanced)).nextState, 'BALANCED');
  assert.equal((await appendRace(groupKey, aggregateKey, published)).nextState, 'PUBLISHED');

  const replay = await appendRace(groupKey, aggregateKey, published);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.stateChanged, false);

  const snapshot = await readHipicoDomainAggregate({ ownerId: OWNER_ID, groupKey, aggregateKind: 'race', aggregateKey, limit: 20 });
  assert.equal(snapshot?.aggregate.status, 'PUBLISHED');
  assert.equal(snapshot?.aggregate.stateVersion, 7);
  assert.equal(snapshot?.events.length, 7);
});

test('simultaneous groups A/B remain isolated even with the same race key and source labels', async () => {
  const groupA = `${runKey}-group-a`;
  const groupB = `${runKey}-group-b`;
  const aggregateKey = `${runKey}-shared-race-key`;
  const openA = event('RACE_OPENED', `${runKey}:A:open`, { marker: 'A' });
  const openB = event('RACE_OPENED', `${runKey}:B:open`, { marker: 'B' });
  await Promise.all([
    appendRace(groupA, aggregateKey, openA),
    appendRace(groupB, aggregateKey, openB)
  ]);

  const [a, b] = await Promise.all([
    readHipicoDomainAggregate({ ownerId: OWNER_ID, groupKey: groupA, aggregateKind: 'race', aggregateKey, limit: 10 }),
    readHipicoDomainAggregate({ ownerId: OWNER_ID, groupKey: groupB, aggregateKind: 'race', aggregateKey, limit: 10 })
  ]);
  assert.equal(a?.aggregate.status, 'OPEN');
  assert.equal(b?.aggregate.status, 'OPEN');
  assert.equal(a?.events.length, 1);
  assert.equal(b?.events.length, 1);
  assert.deepEqual(a?.events[0].normalizedPayload, { marker: 'A' });
  assert.deepEqual(b?.events[0].normalizedPayload, { marker: 'B' });

  const contamination = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM public.hipico_domain_events
    WHERE owner_id=${OWNER_ID}::uuid
      AND aggregate_key=${aggregateKey}
      AND (
        (group_key=${groupA} AND normalized_payload->>'marker' <> 'A')
        OR
        (group_key=${groupB} AND normalized_payload->>'marker' <> 'B')
      )
  `;
  assert.equal(Number(contamination[0]?.count || 0), 0);
});
