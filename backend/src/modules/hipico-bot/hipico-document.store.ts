import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import {
  DOCUMENT_CLASSIFICATIONS,
  type DocumentAuthority,
  type DocumentClassification,
  type DocumentStore,
  type DocumentStoreInput
} from './hipico-document-engine.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_KEY_RE = /^[A-Za-z0-9._:-]{3,120}$/;

function documentError(code: string) { return Object.assign(new Error(code), { code }); }
function assertScope(ownerId: string, groupKey: string) {
  if (!UUID_RE.test(String(ownerId || '').trim())) throw documentError('HIPICO_DOCUMENT_OWNER_INVALID');
  if (!GROUP_KEY_RE.test(String(groupKey || '').trim())) throw documentError('HIPICO_DOCUMENT_GROUP_INVALID');
}
function assertDocumentId(id: string) { if (!UUID_RE.test(String(id || '').trim())) throw documentError('HIPICO_DOCUMENT_ID_INVALID'); }

function rowToPublic(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    groupKey: row.groupKey,
    sha256: row.sha256,
    sizeBytes: Number(row.sizeBytes),
    pageCountEstimate: Number(row.pageCountEstimate),
    filename: row.filename,
    mime: row.mime,
    classification: row.classification,
    confidence: Number(row.confidence || 0),
    authority: row.authority,
    parserVersion: row.parserVersion,
    status: row.status,
    extraction: row.extraction,
    supersedesId: row.supersedesId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    approvedAt: row.approvedAt,
    approvedBy: row.approvedBy
  };
}

export class PostgresDocumentStore implements DocumentStore {
  async put(input: DocumentStoreInput) {
    assertScope(input.ownerId, input.groupKey);
    if (input.supersedesId) assertDocumentId(input.supersedesId);
    return prisma.$transaction(async (tx) => {
      if (input.supersedesId) {
        const prior = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM public.hipico_documents
          WHERE id=${input.supersedesId}::uuid AND owner_id=${input.ownerId}::uuid AND group_key=${input.groupKey}
          LIMIT 1 FOR UPDATE`;
        if (!prior[0]) throw documentError('HIPICO_DOCUMENT_SUPERSEDES_NOT_FOUND');
      }

      if (input.provenance.sourceMessageId) {
        const replay = await tx.$queryRaw<Array<{ documentId: string; sha256: string }>>`
          SELECT s.document_id AS "documentId",d.sha256
          FROM public.hipico_document_sources s
          JOIN public.hipico_documents d ON d.id=s.document_id
          WHERE s.owner_id=${input.ownerId}::uuid AND s.group_key=${input.groupKey}
            AND s.source_channel=${input.provenance.sourceChannel}
            AND s.source_message_id=${input.provenance.sourceMessageId}
          LIMIT 1 FOR UPDATE OF s`;
        if (replay[0] && replay[0].sha256 !== input.envelope.sha256) throw documentError('HIPICO_DOCUMENT_SOURCE_REPLAY_MISMATCH');
        if (replay[0]) return { id: replay[0].documentId, duplicate: true };
      }

      const existing = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM public.hipico_documents
        WHERE owner_id=${input.ownerId}::uuid AND group_key=${input.groupKey} AND sha256=${input.envelope.sha256}
        LIMIT 1 FOR UPDATE`;
      const documentId = existing[0]?.id || crypto.randomUUID();
      if (!existing[0]) {
        await tx.$executeRaw`
          INSERT INTO public.hipico_documents(
            id,owner_id,group_key,sha256,size_bytes,page_count_estimate,filename,mime,raw_pdf,
            classification,confidence,authority,parser_version,status,extraction,supersedes_id
          ) VALUES (
            ${documentId}::uuid,${input.ownerId}::uuid,${input.groupKey},${input.envelope.sha256},${input.envelope.sizeBytes},
            ${input.envelope.pageCountEstimate},${input.envelope.filename},${input.envelope.mime},${input.pdf},${input.classification},
            ${input.confidence},${input.provenance.authority},${input.parserVersion},'uploaded',${JSON.stringify(input.extraction)}::jsonb,
            ${input.supersedesId || null}::uuid
          )`;
      }
      await tx.$executeRaw`
        INSERT INTO public.hipico_document_sources(
          id,document_id,owner_id,group_key,source_channel,source_message_id,sender,received_at,authority
        ) VALUES (
          ${crypto.randomUUID()}::uuid,${documentId}::uuid,${input.ownerId}::uuid,${input.groupKey},${input.provenance.sourceChannel},
          ${input.provenance.sourceMessageId || null},${input.provenance.sender || null},${new Date(input.provenance.receivedAt)},${input.provenance.authority}
        ) ON CONFLICT DO NOTHING`;
      return { id: documentId, duplicate: Boolean(existing[0]) };
    });
  }

  async updateExtraction(id: string, ownerId: string, groupKey: string, input: { classification: DocumentClassification; confidence: number; parserVersion: string; status: 'extracted'|'review'; extraction: Record<string, unknown> }) {
    assertScope(ownerId, groupKey);
    assertDocumentId(id);
    if (!DOCUMENT_CLASSIFICATIONS.includes(input.classification)) throw documentError('HIPICO_DOCUMENT_CLASSIFICATION_INVALID');
    if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) throw documentError('HIPICO_DOCUMENT_CONFIDENCE_INVALID');
    const parserVersion = String(input.parserVersion || '').trim();
    if (!parserVersion || parserVersion.length > 120) throw documentError('HIPICO_DOCUMENT_PARSER_VERSION_INVALID');
    const affected = await prisma.$executeRaw`
      UPDATE public.hipico_documents
      SET classification=${input.classification},confidence=${input.confidence},parser_version=${parserVersion},
          status=${input.status},extraction=${JSON.stringify(input.extraction)}::jsonb,updated_at=now()
      WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey}`;
    if (affected !== 1) throw documentError('HIPICO_DOCUMENT_NOT_FOUND');
  }

  async getRaw(ownerId: string, groupKey: string, id: string) {
    assertScope(ownerId, groupKey);
    assertDocumentId(id);
    const rows = await prisma.$queryRaw<Array<{ rawPdf: Buffer }>>`
      SELECT raw_pdf AS "rawPdf" FROM public.hipico_documents
      WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} LIMIT 1`;
    return rows[0]?.rawPdf || null;
  }

  async getAuthority(ownerId: string, groupKey: string, id: string): Promise<DocumentAuthority> {
    assertScope(ownerId, groupKey);
    assertDocumentId(id);
    const rows = await prisma.$queryRaw<Array<{ authority: DocumentAuthority }>>`
      SELECT authority FROM public.hipico_documents
      WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} LIMIT 1`;
    if (!rows[0]) throw documentError('HIPICO_DOCUMENT_NOT_FOUND');
    return rows[0].authority;
  }

  async list(ownerId: string, groupKey: string, limit = 50) {
    assertScope(ownerId, groupKey);
    const bounded = Math.min(100, Math.max(1, Math.trunc(limit) || 50));
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id,group_key AS "groupKey",sha256,size_bytes AS "sizeBytes",page_count_estimate AS "pageCountEstimate",
        filename,mime,classification,confidence,authority,parser_version AS "parserVersion",status,extraction,
        supersedes_id AS "supersedesId",created_at AS "createdAt",updated_at AS "updatedAt",approved_at AS "approvedAt",approved_by AS "approvedBy"
      FROM public.hipico_documents
      WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey}
      ORDER BY created_at DESC,id DESC LIMIT ${bounded}`;
    return rows.map(rowToPublic);
  }

  async get(ownerId: string, groupKey: string, id: string) {
    assertScope(ownerId, groupKey);
    assertDocumentId(id);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id,group_key AS "groupKey",sha256,size_bytes AS "sizeBytes",page_count_estimate AS "pageCountEstimate",
        filename,mime,classification,confidence,authority,parser_version AS "parserVersion",status,extraction,
        supersedes_id AS "supersedesId",created_at AS "createdAt",updated_at AS "updatedAt",approved_at AS "approvedAt",approved_by AS "approvedBy"
      FROM public.hipico_documents
      WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} LIMIT 1`;
    return rowToPublic(rows[0]);
  }

  async sources(ownerId: string, groupKey: string, id: string) {
    assertScope(ownerId, groupKey);
    assertDocumentId(id);
    return prisma.$queryRaw`
      SELECT source_channel AS "sourceChannel",source_message_id AS "sourceMessageId",sender,received_at AS "receivedAt",authority
      FROM public.hipico_document_sources
      WHERE document_id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey}
      ORDER BY received_at ASC,id ASC`;
  }

  async approve(ownerId: string, groupKey: string, id: string, classification: DocumentClassification, operatorId: string) {
    assertScope(ownerId, groupKey);
    assertDocumentId(id);
    if (!DOCUMENT_CLASSIFICATIONS.includes(classification) || classification === 'UNKNOWN') throw documentError('HIPICO_DOCUMENT_CLASSIFICATION_INVALID');
    const approvedBy = String(operatorId || '').trim();
    if (approvedBy.length < 3 || approvedBy.length > 220) throw documentError('HIPICO_DOCUMENT_OPERATOR_INVALID');
    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ authority: DocumentAuthority; status: string }>>`
        SELECT authority,status FROM public.hipico_documents
        WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} LIMIT 1 FOR UPDATE`;
      if (!rows[0]) throw documentError('HIPICO_DOCUMENT_NOT_FOUND');
      if (classification === 'OFFICIAL_RESULT' && rows[0].authority !== 'official') throw documentError('HIPICO_DOCUMENT_OFFICIAL_AUTHORITY_REQUIRED');
      await tx.$executeRaw`
        UPDATE public.hipico_documents
        SET classification=${classification},status='approved',approved_at=now(),approved_by=${approvedBy},updated_at=now()
        WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey}`;
      return { ok: true };
    });
  }
}
