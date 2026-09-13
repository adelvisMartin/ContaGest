import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DocumentIngestionService,
  authorizeDocumentClassification,
  validatePdfEnvelope,
  type DocumentStore,
  type DocumentStoreInput,
  type PdfTextExtractor
} from './hipico-document-engine.js';

const pdf = (body = '') => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Page >>\n${body}\nendobj\n%%EOF\n`, 'latin1');

class MemoryStore implements DocumentStore {
  rows = new Map<string, any>();
  hashes = new Map<string, string>();
  updates: any[] = [];
  async put(input: DocumentStoreInput) {
    const prior = this.hashes.get(input.envelope.sha256);
    if (prior) return { id: prior, duplicate: true };
    const id = `00000000-0000-4000-8000-${String(this.rows.size + 1).padStart(12, '0')}`;
    this.hashes.set(input.envelope.sha256, id);
    this.rows.set(id, { ...input });
    return { id, duplicate: false };
  }
  async updateExtraction(id: string, _owner: string, _group: string, input: any) { this.updates.push({ id, ...input }); }
  async getRaw(_owner: string, _group: string, id: string) { return this.rows.get(id)?.pdf || null; }
  async getAuthority(_owner: string, _group: string, id: string) { return this.rows.get(id)?.provenance.authority || 'unknown'; }
}

const nativeExtractor: PdfTextExtractor = {
  capability: () => ({ configured: true, nativeText: true, ocr: false, parserVersion: 'fixture' }),
  async extract() { return { text: 'Programa de carreras. Carrera 3. Ejemplar UNO.', method: 'native_text', parserVersion: 'fixture', pageCount: 1 }; }
};

test('hostile/escaped PDF active content fails closed before persistence', () => {
  assert.throws(() => validatePdfEnvelope(pdf('/OpenAction 7 0 R'), 'bad.pdf'), (error: any) => error?.code === 'PDF_ACTIVE_CONTENT_REJECTED');
  assert.throws(() => validatePdfEnvelope(pdf('/Java#53cript 7 0 R'), 'escaped-js.pdf'), (error: any) => error?.code === 'PDF_ACTIVE_CONTENT_REJECTED');
  assert.throws(() => validatePdfEnvelope(pdf('/Open#41ction 7 0 R'), 'escaped-action.pdf'), (error: any) => error?.code === 'PDF_ACTIVE_CONTENT_REJECTED');
  assert.throws(() => validatePdfEnvelope(pdf('/AA << /S /URI >>'), 'additional-action.pdf'), (error: any) => error?.code === 'PDF_ACTIVE_CONTENT_REJECTED');
  assert.throws(() => validatePdfEnvelope(pdf('/EmbeddedFile 8 0 R'), 'embedded.pdf'), (error: any) => error?.code === 'PDF_ACTIVE_CONTENT_REJECTED');
});

test('malformed and oversized PDFs fail closed before persistence', () => {
  const malformed = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >>', 'latin1');
  assert.throws(() => validatePdfEnvelope(malformed, 'bad.pdf'), (error: any) => error?.code === 'PDF_STRUCTURE_INVALID');
  const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0x20);
  oversized.write('%PDF-1.4\n1 0 obj << /Type /Page >>\nendobj\n', 0, 'latin1');
  assert.throws(() => validatePdfEnvelope(oversized, 'large.pdf'), (error: any) => error?.code === 'PDF_TOO_LARGE');
});

test('official words never grant official authority by themselves', () => {
  assert.deepEqual(authorizeDocumentClassification({ classification: 'OFFICIAL_RESULT', confidence: .98 }, 'group_evidence'), { classification: 'RESULT', confidence: .9, claimedOfficial: true });
  assert.equal(authorizeDocumentClassification({ classification: 'OFFICIAL_RESULT', confidence: .98 }, 'official').classification, 'OFFICIAL_RESULT');
});

test('native text extraction persists classification without OCR', async () => {
  const store = new MemoryStore();
  const service = new DocumentIngestionService(store, nativeExtractor);
  const result = await service.ingest({
    ownerId: '00000000-0000-4000-8000-000000000001', groupKey: 'group-a', pdf: pdf(), filename: 'programa.pdf',
    provenance: { sourceChannel: 'operator', receivedAt: '2026-09-11T19:00:00.000Z', authority: 'operator' }
  });
  assert.equal(result.extractionStatus, 'extracted');
  assert.equal(result.classification, 'RACE_PROGRAM');
  assert.equal(store.updates[0].extraction.method, 'native_text');
});

test('duplicate hash produces zero duplicate extraction effects', async () => {
  const store = new MemoryStore();
  let calls = 0;
  const extractor: PdfTextExtractor = { ...nativeExtractor, async extract(...args) { calls += 1; return nativeExtractor.extract(...args); } };
  const service = new DocumentIngestionService(store, extractor);
  const input = {
    ownerId: '00000000-0000-4000-8000-000000000001', groupKey: 'group-a', pdf: pdf('same'),
    provenance: { sourceChannel: 'operator', receivedAt: '2026-09-11T19:00:00.000Z', authority: 'operator' as const }
  };
  await service.ingest(input);
  const duplicate = await service.ingest(input);
  assert.equal(duplicate.duplicate, true);
  assert.equal(calls, 1);
});

test('unknown extraction remains in review state', async () => {
  const store = new MemoryStore();
  const extractor: PdfTextExtractor = {
    capability: () => ({ configured: true, nativeText: true, ocr: false, parserVersion: 'fixture' }),
    async extract() { return { text: 'contenido no reconocido', method: 'native_text', parserVersion: 'fixture' }; }
  };
  const service = new DocumentIngestionService(store, extractor);
  await service.ingest({
    ownerId: '00000000-0000-4000-8000-000000000001', groupKey: 'group-a', pdf: pdf('unknown'),
    provenance: { sourceChannel: 'operator', receivedAt: '2026-09-11T19:00:00.000Z', authority: 'operator' }
  });
  assert.equal(store.updates[0].status, 'review');
  assert.equal(store.updates[0].classification, 'UNKNOWN');
});

test('OCR result is accepted only through the extractor fallback contract', async () => {
  const store = new MemoryStore();
  const extractor: PdfTextExtractor = {
    capability: () => ({ configured: true, nativeText: true, ocr: true, parserVersion: 'fixture+ocr' }),
    async extract() { return { text: 'Pizarra resultado 5 3 1', method: 'ocr', parserVersion: 'fixture+ocr', pageCount: 1 }; }
  };
  const service = new DocumentIngestionService(store, extractor);
  await service.ingest({
    ownerId: '00000000-0000-4000-8000-000000000001', groupKey: 'group-a', pdf: pdf('scan'),
    provenance: { sourceChannel: 'operator', receivedAt: '2026-09-11T19:00:00.000Z', authority: 'operator' }
  });
  assert.equal(store.updates[0].extraction.method, 'ocr');
  assert.equal(store.updates[0].classification, 'RESULT');
});
