import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import type { DocumentAuthority, DocumentClassification, DocumentStore, DocumentStoreInput } from './document-engine.js';

const ID_RE=/^[0-9a-f-]{36}$/i;const GROUP_KEY_RE=/^[A-Za-z0-9._:-]{3,120}$/;
function assertScope(ownerId:string,groupKey:string){if(!ID_RE.test(ownerId))throw Object.assign(new Error('HIPICO_DOCUMENT_OWNER_INVALID'),{code:'HIPICO_DOCUMENT_OWNER_INVALID'});if(!GROUP_KEY_RE.test(groupKey))throw Object.assign(new Error('HIPICO_DOCUMENT_GROUP_INVALID'),{code:'HIPICO_DOCUMENT_GROUP_INVALID'});}
function rowToPublic(row:any){if(!row)return null;return{id:row.id,groupKey:row.groupKey,sha256:row.sha256,sizeBytes:Number(row.sizeBytes),pageCountEstimate:Number(row.pageCountEstimate),filename:row.filename,mime:row.mime,classification:row.classification,confidence:Number(row.confidence||0),authority:row.authority,parserVersion:row.parserVersion,status:row.status,extraction:row.extraction,supersedesId:row.supersedesId,createdAt:row.createdAt,updatedAt:row.updatedAt,approvedAt:row.approvedAt,approvedBy:row.approvedBy};}

export class PostgresDocumentStore implements DocumentStore {
  async put(input:DocumentStoreInput){
    assertScope(input.ownerId,input.groupKey);
    return prisma.$transaction(async(tx)=>{
      const lockKeys=[`hash:${input.ownerId}:${input.groupKey}:${input.envelope.sha256}`];
      if(input.provenance.sourceMessageId)lockKeys.push(`source:${input.ownerId}:${input.groupKey}:${input.provenance.sourceChannel}:${input.provenance.sourceMessageId}`);
      lockKeys.sort();
      for(const lockKey of lockKeys)await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey},0))`;
      if(input.supersedesId){const prior=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM public.hipico_documents WHERE id=${input.supersedesId}::uuid AND owner_id=${input.ownerId}::uuid AND group_key=${input.groupKey} LIMIT 1 FOR UPDATE`;if(!prior[0])throw Object.assign(new Error('HIPICO_DOCUMENT_SUPERSEDES_NOT_FOUND'),{code:'HIPICO_DOCUMENT_SUPERSEDES_NOT_FOUND'});}
      if(input.provenance.sourceMessageId){
        const replay=await tx.$queryRaw<Array<{documentId:string;sha256:string;status:string}>>`SELECT s.document_id AS "documentId",d.sha256,d.status FROM public.hipico_document_sources s JOIN public.hipico_documents d ON d.id=s.document_id WHERE s.owner_id=${input.ownerId}::uuid AND s.group_key=${input.groupKey} AND s.source_channel=${input.provenance.sourceChannel} AND s.source_message_id=${input.provenance.sourceMessageId} LIMIT 1`;
        if(replay[0]&&replay[0].sha256!==input.envelope.sha256)throw Object.assign(new Error('HIPICO_DOCUMENT_SOURCE_REPLAY_MISMATCH'),{code:'HIPICO_DOCUMENT_SOURCE_REPLAY_MISMATCH'});
        if(replay[0])return{id:replay[0].documentId,duplicate:true,status:replay[0].status};
      }
      const existing=await tx.$queryRaw<Array<{id:string;status:string}>>`SELECT id,status FROM public.hipico_documents WHERE owner_id=${input.ownerId}::uuid AND group_key=${input.groupKey} AND sha256=${input.envelope.sha256} LIMIT 1 FOR UPDATE`;
      const documentId=existing[0]?.id||crypto.randomUUID();
      if(!existing[0]){
        await tx.$executeRaw`INSERT INTO public.hipico_documents(id,owner_id,group_key,sha256,size_bytes,page_count_estimate,filename,mime,raw_pdf,classification,confidence,authority,parser_version,status,extraction,supersedes_id) VALUES (${documentId}::uuid,${input.ownerId}::uuid,${input.groupKey},${input.envelope.sha256},${input.envelope.sizeBytes},${input.envelope.pageCountEstimate},${input.envelope.filename},${input.envelope.mime},${input.pdf},${input.classification},${input.confidence},${input.provenance.authority},${input.parserVersion},'uploaded',${JSON.stringify(input.extraction)}::jsonb,${input.supersedesId||null}::uuid)`;
        await tx.$executeRaw`INSERT INTO public.hipico_document_events(id,document_id,owner_id,group_key,event_type,classification,confidence,parser_version,status,extraction) VALUES(${crypto.randomUUID()}::uuid,${documentId}::uuid,${input.ownerId}::uuid,${input.groupKey},'UPLOADED',${input.classification},${input.confidence},${input.parserVersion},'uploaded',${JSON.stringify(input.extraction)}::jsonb)`;
      }
      await tx.$executeRaw`INSERT INTO public.hipico_document_sources(id,document_id,owner_id,group_key,source_channel,source_message_id,sender,received_at,authority) VALUES (${crypto.randomUUID()}::uuid,${documentId}::uuid,${input.ownerId}::uuid,${input.groupKey},${input.provenance.sourceChannel},${input.provenance.sourceMessageId||null},${input.provenance.sender||null},${new Date(input.provenance.receivedAt)},${input.provenance.authority}) ON CONFLICT DO NOTHING`;
      return{id:documentId,duplicate:Boolean(existing[0]),status:existing[0]?.status||'uploaded'};
    });
  }
  async claimExtraction(id:string,ownerId:string,groupKey:string,allowProcessed=false){
    assertScope(ownerId,groupKey);
    const rows=await prisma.$queryRaw<Array<{id:string}>>`
      UPDATE public.hipico_documents
      SET status='uploaded',extraction=jsonb_build_object('status','processing'),
          approved_at=CASE WHEN ${allowProcessed}::boolean THEN NULL ELSE approved_at END,
          approved_by=CASE WHEN ${allowProcessed}::boolean THEN NULL ELSE approved_by END,
          updated_at=now()
      WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey}
        AND coalesce(extraction->>'status','') <> 'processing'
        AND (${allowProcessed}::boolean OR status IN ('uploaded','failed'))
      RETURNING id::text AS id`;
    return Boolean(rows[0]);
  }
  async markExtractionFailed(id:string,ownerId:string,groupKey:string,errorCode:string){
    assertScope(ownerId,groupKey);const safeCode=/^[A-Z0-9_:-]{3,120}$/.test(errorCode)?errorCode:'HIPICO_DOCUMENT_EXTRACTION_FAILED';
    return prisma.$transaction(async(tx)=>{
      const rows=await tx.$queryRaw<Array<{classification:DocumentClassification;confidence:number;parserVersion:string|null}>>`SELECT classification,confidence,parser_version AS "parserVersion" FROM public.hipico_documents WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} LIMIT 1 FOR UPDATE`;
      if(!rows[0])throw Object.assign(new Error('HIPICO_DOCUMENT_NOT_FOUND'),{code:'HIPICO_DOCUMENT_NOT_FOUND'});
      const extraction={status:'failed',errorCode:safeCode};
      const affected=await tx.$executeRaw`UPDATE public.hipico_documents SET status='failed',extraction=${JSON.stringify(extraction)}::jsonb,updated_at=now() WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} AND extraction->>'status'='processing'`;
      if(affected!==1)throw Object.assign(new Error('HIPICO_DOCUMENT_EXTRACTION_NOT_CLAIMED'),{code:'HIPICO_DOCUMENT_EXTRACTION_NOT_CLAIMED'});
      await tx.$executeRaw`INSERT INTO public.hipico_document_events(id,document_id,owner_id,group_key,event_type,classification,confidence,parser_version,status,extraction) VALUES(${crypto.randomUUID()}::uuid,${id}::uuid,${ownerId}::uuid,${groupKey},'EXTRACTION',${rows[0].classification},${Number(rows[0].confidence||0)},${rows[0].parserVersion},'failed',${JSON.stringify(extraction)}::jsonb)`;
    });
  }
  async updateExtraction(id:string,ownerId:string,groupKey:string,input:{classification:DocumentClassification;confidence:number;parserVersion:string;status:'extracted'|'review';extraction:Record<string,unknown>}){
    assertScope(ownerId,groupKey);
    return prisma.$transaction(async(tx)=>{
      const affected=await tx.$executeRaw`UPDATE public.hipico_documents SET classification=${input.classification},confidence=${input.confidence},parser_version=${input.parserVersion},status=${input.status},extraction=${JSON.stringify(input.extraction)}::jsonb,updated_at=now() WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} AND extraction->>'status'='processing'`;
      if(affected!==1)throw Object.assign(new Error('HIPICO_DOCUMENT_EXTRACTION_NOT_CLAIMED'),{code:'HIPICO_DOCUMENT_EXTRACTION_NOT_CLAIMED'});
      await tx.$executeRaw`INSERT INTO public.hipico_document_events(id,document_id,owner_id,group_key,event_type,classification,confidence,parser_version,status,extraction) VALUES(${crypto.randomUUID()}::uuid,${id}::uuid,${ownerId}::uuid,${groupKey},'EXTRACTION',${input.classification},${input.confidence},${input.parserVersion},${input.status},${JSON.stringify(input.extraction)}::jsonb)`;
    });
  }
  async getRaw(ownerId:string,groupKey:string,id:string){assertScope(ownerId,groupKey);const rows=await prisma.$queryRaw<Array<{rawPdf:Buffer}>>`SELECT raw_pdf AS "rawPdf" FROM public.hipico_documents WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} LIMIT 1`;return rows[0]?.rawPdf||null;}
  async getAuthority(ownerId:string,groupKey:string,id:string):Promise<DocumentAuthority>{assertScope(ownerId,groupKey);const rows=await prisma.$queryRaw<Array<{authority:DocumentAuthority}>>`SELECT authority FROM public.hipico_documents WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} LIMIT 1`;if(!rows[0])throw Object.assign(new Error('HIPICO_DOCUMENT_NOT_FOUND'),{code:'HIPICO_DOCUMENT_NOT_FOUND'});return rows[0].authority;}
  async list(ownerId:string,groupKey:string,limit=50){assertScope(ownerId,groupKey);const bounded=Math.min(100,Math.max(1,Math.trunc(limit)||50));const rows=await prisma.$queryRaw<any[]>`SELECT id,group_key AS "groupKey",sha256,size_bytes AS "sizeBytes",page_count_estimate AS "pageCountEstimate",filename,mime,classification,confidence,authority,parser_version AS "parserVersion",status,extraction,supersedes_id AS "supersedesId",created_at AS "createdAt",updated_at AS "updatedAt",approved_at AS "approvedAt",approved_by AS "approvedBy" FROM public.hipico_documents WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} ORDER BY created_at DESC LIMIT ${bounded}`;return rows.map(rowToPublic);}
  async get(ownerId:string,groupKey:string,id:string){assertScope(ownerId,groupKey);const rows=await prisma.$queryRaw<any[]>`SELECT id,group_key AS "groupKey",sha256,size_bytes AS "sizeBytes",page_count_estimate AS "pageCountEstimate",filename,mime,classification,confidence,authority,parser_version AS "parserVersion",status,extraction,supersedes_id AS "supersedesId",created_at AS "createdAt",updated_at AS "updatedAt",approved_at AS "approvedAt",approved_by AS "approvedBy" FROM public.hipico_documents WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} LIMIT 1`;return rowToPublic(rows[0]);}
  async sources(ownerId:string,groupKey:string,id:string){assertScope(ownerId,groupKey);return prisma.$queryRaw`SELECT source_channel AS "sourceChannel",source_message_id AS "sourceMessageId",sender,received_at AS "receivedAt",authority FROM public.hipico_document_sources WHERE document_id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} ORDER BY received_at ASC,id ASC`;}
  async events(ownerId:string,groupKey:string,id:string){assertScope(ownerId,groupKey);return prisma.$queryRaw`SELECT id::text,event_type AS "eventType",classification,confidence,parser_version AS "parserVersion",status,extraction,actor_id AS "actorId",created_at AS "createdAt" FROM public.hipico_document_events WHERE document_id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} ORDER BY created_at ASC,id ASC`;}
  async approve(ownerId:string,groupKey:string,id:string,classification:DocumentClassification,operatorId:string){
    assertScope(ownerId,groupKey);return prisma.$transaction(async(tx)=>{
      const rows=await tx.$queryRaw<Array<{authority:DocumentAuthority;status:string;confidence:number;parserVersion:string|null;extraction:Record<string,unknown>}>>`SELECT authority,status,confidence,parser_version AS "parserVersion",extraction FROM public.hipico_documents WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} LIMIT 1 FOR UPDATE`;
      if(!rows[0])throw Object.assign(new Error('HIPICO_DOCUMENT_NOT_FOUND'),{code:'HIPICO_DOCUMENT_NOT_FOUND'});if(classification==='OFFICIAL_RESULT'&&rows[0].authority!=='official')throw Object.assign(new Error('HIPICO_DOCUMENT_OFFICIAL_AUTHORITY_REQUIRED'),{code:'HIPICO_DOCUMENT_OFFICIAL_AUTHORITY_REQUIRED'});
      await tx.$executeRaw`UPDATE public.hipico_documents SET classification=${classification},status='approved',approved_at=now(),approved_by=${operatorId},updated_at=now() WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey}`;
      await tx.$executeRaw`INSERT INTO public.hipico_document_events(id,document_id,owner_id,group_key,event_type,classification,confidence,parser_version,status,extraction,actor_id) VALUES(${crypto.randomUUID()}::uuid,${id}::uuid,${ownerId}::uuid,${groupKey},'APPROVED',${classification},${Number(rows[0].confidence||0)},${rows[0].parserVersion},'approved',${JSON.stringify(rows[0].extraction||{})}::jsonb,${operatorId})`;
      return{ok:true};
    });
  }
}
