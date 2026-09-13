import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DocumentIngestionService,
  type DocumentAuthority,
  type DocumentStore,
  type DocumentStoreInput,
  type PdfTextExtractor
} from './document-engine.js';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n%%EOF\n', 'latin1');
const ownerId = '00000000-0000-4000-8000-000000000001';
const groupKey = 'group-recovery';

class RecoveryStore implements DocumentStore {
  row: any = null;
  claims = 0;
  failures = 0;
  updates = 0;

  async put(input: DocumentStoreInput) {
    if (this.row) return { id: this.row.id, duplicate: true, status: this.row.status };
    this.row = {
      id: '00000000-0000-4000-8000-000000000010',
      pdf: input.pdf,
      status: 'uploaded',
      authority: input.provenance.authority,
      extraction: { status: 'not_extracted' },
      approvedAt: null,
      approvedBy: null
    };
    return { id: this.row.id, duplicate: false, status: this.row.status };
  }

  async claimExtraction(_id: string, _owner: string, _group: string, allowProcessed = false) {
    if (this.row.extraction?.status === 'processing') return false;
    if (!allowProcessed && !['uploaded', 'failed'].includes(this.row.status)) return false;
    this.claims += 1;
    this.row.status = 'uploaded';
    this.row.extraction = { status: 'processing' };
    if (allowProcessed) {
      this.row.approvedAt = null;
      this.row.approvedBy = null;
    }
    return true;
  }

  async markExtractionFailed(_id: string, _owner: string, _group: string, errorCode: string) {
    this.failures += 1;
    this.row.status = 'failed';
    this.row.extraction = { status: 'failed', errorCode };
  }

  async updateExtraction(_id: string, _owner: string, _group: string, input: any) {
    this.updates += 1;
    this.row.status = input.status;
    this.row.extraction = input.extraction;
  }

  async getRaw() { return this.row?.pdf || null; }
  async getAuthority(): Promise<DocumentAuthority> { return this.row?.authority || 'unknown'; }
}

test('a transient extraction failure becomes failed and retrying the same hash resumes exactly once', async () => {
  const store = new RecoveryStore();
  let attempts = 0;
  const extractor: PdfTextExtractor = {
    capability: () => ({ configured: true, nativeText: true, ocr: false, parserVersion: 'recovery-fixture' }),
    async extract() {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('fixture transient failure'), { code: 'FIXTURE_TRANSIENT' });
      return { text: 'PROGRAMA DE CARRERAS\nCARRERA 1', method: 'native_text', parserVersion: 'recovery-fixture', pageCount: 1 };
    }
  };
  const service = new DocumentIngestionService(store, extractor);
  const input = {
    ownerId,
    groupKey,
    pdf,
    filename: 'retry.pdf',
    provenance: { sourceChannel: 'operator', receivedAt: '2026-09-12T18:00:00.000Z', authority: 'operator' as const }
  };

  await assert.rejects(service.ingest(input), (error: any) => error?.code === 'FIXTURE_TRANSIENT');
  assert.equal(store.row.status, 'failed');
  assert.equal(store.failures, 1);
  assert.equal(store.claims, 1);

  const recovered = await service.ingest(input);
  assert.equal(recovered.duplicate, true);
  assert.equal(recovered.extractionStatus, 'extracted');
  assert.equal(attempts, 2);
  assert.equal(store.claims, 2);
  assert.equal(store.updates, 1);
});

test('a duplicate observed while extraction is already processing does not start a second extractor', async () => {
  const store = new RecoveryStore();
  await store.put({
    ownerId,
    groupKey,
    envelope: { sha256: 'a'.repeat(64), sizeBytes: pdf.length, pageCountEstimate: 1, filename: 'processing.pdf', mime: 'application/pdf' },
    pdf,
    provenance: { sourceChannel: 'operator', receivedAt: '2026-09-12T18:00:00.000Z', authority: 'operator' },
    classification: 'UNKNOWN', confidence: 0, parserVersion: null, extraction: { status: 'not_extracted' }
  });
  store.row.extraction = { status: 'processing' };
  let attempts = 0;
  const extractor: PdfTextExtractor = {
    capability: () => ({ configured: true, nativeText: true, ocr: false, parserVersion: 'fixture' }),
    async extract() { attempts += 1; return { text: 'PROGRAMA DE CARRERAS', method: 'native_text', parserVersion: 'fixture' }; }
  };
  const service = new DocumentIngestionService(store, extractor);
  const result = await service.ingest({
    ownerId, groupKey, pdf, filename: 'processing.pdf',
    provenance: { sourceChannel: 'operator', receivedAt: '2026-09-12T18:00:00.000Z', authority: 'operator' }
  });
  assert.equal(result.duplicate, true);
  assert.equal(result.extractionStatus, 'processing');
  assert.equal(attempts, 0);
});

test('manual reprocess claims the document and invalidates a prior approval before recalculation', async () => {
  const store = new RecoveryStore();
  await store.put({
    ownerId,
    groupKey,
    envelope: { sha256: 'a'.repeat(64), sizeBytes: pdf.length, pageCountEstimate: 1, filename: 'approved.pdf', mime: 'application/pdf' },
    pdf,
    provenance: { sourceChannel: 'official-feed', receivedAt: '2026-09-12T18:00:00.000Z', authority: 'official' },
    classification: 'UNKNOWN', confidence: 0, parserVersion: null, extraction: { status: 'not_extracted' }
  });
  store.row.status = 'approved';
  store.row.approvedAt = '2026-09-12T18:05:00.000Z';
  store.row.approvedBy = 'operator-1';
  store.row.extraction = { status: 'extracted' };
  const extractor: PdfTextExtractor = {
    capability: () => ({ configured: true, nativeText: true, ocr: false, parserVersion: 'fixture' }),
    async extract() { return { text: 'RESULTADO OFICIAL\nCARRERA 1', method: 'native_text', parserVersion: 'fixture', pageCount: 1 }; }
  };
  const service = new DocumentIngestionService(store, extractor);
  const result = await service.reprocessExisting({ id: store.row.id, ownerId, groupKey, filename: 'approved.pdf' });
  assert.equal(result.extractionStatus, 'extracted');
  assert.equal(store.row.approvedAt, null);
  assert.equal(store.row.approvedBy, null);
});
