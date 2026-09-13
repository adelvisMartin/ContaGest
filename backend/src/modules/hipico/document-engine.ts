import crypto from 'node:crypto';
import { parseHorseRacingDocument, reconcileDocumentExtraction } from './document-parser.js';

export const DOCUMENT_CLASSIFICATIONS = ['RACE_PROGRAM','ENTRIES','SCRATCHES','ARRIVAL','RESULT','OFFICIAL_RESULT','ANNOUNCEMENT','UNKNOWN'] as const;
export type DocumentClassification = typeof DOCUMENT_CLASSIFICATIONS[number];
export type DocumentAuthority = 'official'|'trusted'|'operator'|'group_evidence'|'unknown';

export type DocumentProvenance = {
  sourceChannel: string;
  sourceMessageId?: string | null;
  sender?: string | null;
  receivedAt: string;
  authority: DocumentAuthority;
};

export type PdfEnvelope = {
  sha256: string;
  sizeBytes: number;
  pageCountEstimate: number;
  filename: string;
  mime: 'application/pdf';
};

export type ExtractionResult = {
  text: string;
  method: 'native_text'|'ocr';
  parserVersion: string;
  pageCount?: number;
};

export interface PdfTextExtractor {
  capability(): { configured: boolean; nativeText: boolean; ocr: boolean; parserVersion: string | null };
  extract(pdf: Buffer, signal: AbortSignal): Promise<ExtractionResult>;
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 200;
const MAX_EXTRACTED_TEXT_CHARS = 200000;
const ACTIVE_PDF_TOKENS = [
  /\/JavaScript\b/i,/\/JS\b/i,/\/EmbeddedFile\b/i,/\/Launch\b/i,/\/OpenAction\b/i,/\/RichMedia\b/i,
  /\/AA\b/i,/\/SubmitForm\b/i,/\/ImportData\b/i,/\/GoToR\b/i
];

function codedError(code:string){return Object.assign(new Error(code),{code});}
function decodePdfNameEscapes(source:string){return source.replace(/#([0-9a-fA-F]{2})/g,(_match,hex)=>String.fromCharCode(Number.parseInt(hex,16)));}
const DOCUMENT_METADATA_ERROR = {
  sourceChannel:'DOCUMENT_SOURCE_CHANNEL_INVALID',
  sourceMessageId:'DOCUMENT_SOURCE_MESSAGE_ID_INVALID',
  sender:'DOCUMENT_SENDER_INVALID'
} as const;
export function strictDocumentMetadata(value:unknown,field:keyof typeof DOCUMENT_METADATA_ERROR,max:number){
  const text=String(value??'').trim();
  if(!text)return null;
  if(text.length>max)throw codedError(DOCUMENT_METADATA_ERROR[field]);
  return text;
}

export function safeDocumentFilename(value: unknown) {
  const raw=String(value||'document.pdf').trim();
  if(!raw||raw.length>180||/[\\/\u0000-\u001f\u007f]/.test(raw)||!raw.toLowerCase().endsWith('.pdf'))throw codedError('PDF_FILENAME_INVALID');
  if(raw==='.'||raw==='..'||/^\.+$/.test(raw))throw codedError('PDF_FILENAME_INVALID');
  return raw;
}

export function validateDocumentProvenance(provenance: DocumentProvenance) {
  const receivedAt = new Date(provenance.receivedAt);
  if (!Number.isFinite(receivedAt.getTime())) throw codedError('DOCUMENT_RECEIVED_AT_INVALID');
  const sourceChannel = strictDocumentMetadata(provenance.sourceChannel,'sourceChannel',120);
  if (!sourceChannel) throw codedError('DOCUMENT_SOURCE_CHANNEL_INVALID');
  const sourceMessageId = provenance.sourceMessageId == null ? null : strictDocumentMetadata(provenance.sourceMessageId,'sourceMessageId',320);
  const sender = provenance.sender == null ? null : strictDocumentMetadata(provenance.sender,'sender',220);
  return {sourceChannel,sourceMessageId,sender,receivedAt:receivedAt.toISOString(),authority:provenance.authority} satisfies DocumentProvenance;
}

export function validatePdfEnvelope(pdf: Buffer, filename?: string, mimeType='application/pdf'): PdfEnvelope {
  const mime=String(mimeType||'').split(';',1)[0].trim().toLowerCase();
  if(mime!=='application/pdf')throw codedError('PDF_MIME_INVALID');
  if (!Buffer.isBuffer(pdf) || pdf.length === 0) throw codedError('PDF_EMPTY');
  if (pdf.length > MAX_PDF_BYTES) throw codedError('PDF_TOO_LARGE');
  if (!pdf.subarray(0,8).toString('latin1').startsWith('%PDF-')) throw codedError('PDF_MAGIC_INVALID');
  const source = pdf.toString('latin1');
  const tail = source.slice(Math.max(0, source.length - 2048));
  if (!/%%EOF\s*$/m.test(tail) || !/\bobj\b[\s\S]*\bendobj\b/.test(source)) throw codedError('PDF_STRUCTURE_INVALID');
  const decodedNames=decodePdfNameEscapes(source);
  for (const token of ACTIVE_PDF_TOKENS) if (token.test(decodedNames)) throw codedError('PDF_ACTIVE_CONTENT_REJECTED');
  const pageCountEstimate = Math.max(1,(decodedNames.match(/\/Type\s*\/Page\b/g)||[]).length);
  if (pageCountEstimate > MAX_PDF_PAGES) throw codedError('PDF_PAGE_LIMIT_EXCEEDED');
  return {sha256:crypto.createHash('sha256').update(pdf).digest('hex'),sizeBytes:pdf.length,pageCountEstimate,filename:safeDocumentFilename(filename),mime:'application/pdf'};
}

export function classifyDocumentText(text: string): { classification: DocumentClassification; confidence: number } {
  const value=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const rules:Array<[DocumentClassification,RegExp,number]> = [
    ['OFFICIAL_RESULT',/RESULTADO\s+OFICIAL|ORDEN\s+OFICIAL|DIVIDENDOS?\s+OFICIALES?/,0.98],
    ['SCRATCHES',/RETIRADOS?|SCRATCH(?:ES)?|NO\s+CORRE/,0.95],
    ['RACE_PROGRAM',/PROGRAMA\s+(?:OFICIAL\s+)?DE\s+CARRERAS|RACE\s+PROGRAM/,0.94],
    ['ENTRIES',/INSCRITOS?|EJEMPLARES?\s+INSCRITOS?|ENTRIES/,0.9],
    ['ARRIVAL',/LLEGADA|ORDEN\s+DE\s+LLEGADA/,0.88],
    ['RESULT',/RESULTADOS?|PIZARRA/,0.86],
    ['ANNOUNCEMENT',/COMUNICADO|ANUNCIO|AVISO\s+OFICIAL/,0.8]
  ];
  for(const [classification,pattern,confidence] of rules) if(pattern.test(value)) return {classification,confidence};
  return {classification:'UNKNOWN',confidence:0};
}

export function authorizeDocumentClassification(candidate:{classification:DocumentClassification;confidence:number},authority:DocumentAuthority) {
  if(candidate.classification==='OFFICIAL_RESULT'&&authority!=='official')return {classification:'RESULT' as const,confidence:Math.min(candidate.confidence,0.9),claimedOfficial:true};
  return {...candidate,claimedOfficial:candidate.classification==='OFFICIAL_RESULT'};
}

export type DocumentStoreInput = {
  ownerId:string;groupKey:string;envelope:PdfEnvelope;pdf:Buffer;provenance:DocumentProvenance;
  classification:DocumentClassification;confidence:number;parserVersion:string|null;extraction:Record<string,unknown>;supersedesId?:string|null;
};

export interface DocumentStore {
  put(input:DocumentStoreInput):Promise<{id:string;duplicate:boolean;status:string}>;
  claimExtraction(id:string,ownerId:string,groupKey:string,allowProcessed?:boolean):Promise<boolean>;
  markExtractionFailed(id:string,ownerId:string,groupKey:string,errorCode:string):Promise<void>;
  updateExtraction(id:string,ownerId:string,groupKey:string,input:{classification:DocumentClassification;confidence:number;parserVersion:string;status:'extracted'|'review';extraction:Record<string,unknown>}):Promise<void>;
  getRaw(ownerId:string,groupKey:string,id:string):Promise<Buffer|null>;
  getAuthority(ownerId:string,groupKey:string,id:string):Promise<DocumentAuthority>;
}

function safeExtractionError(error:any){
  if(error?.name==='AbortError')return codedError('HIPICO_DOCUMENT_EXTRACTION_TIMEOUT');
  const code=String(error?.code||'').trim();
  if(/^[A-Z0-9_:-]{3,120}$/.test(code))return error;
  return codedError('HIPICO_DOCUMENT_EXTRACTION_FAILED');
}

export class DocumentIngestionService {
  constructor(private readonly store:DocumentStore, private readonly extractor:PdfTextExtractor|null = null, private readonly timeoutMs=8000) {}
  capability(){return this.extractor?.capability() || {configured:false,nativeText:false,ocr:false,parserVersion:null};}

  private async extractAndPersist(input:{id:string;ownerId:string;groupKey:string;pdf:Buffer;envelope:PdfEnvelope;authority:DocumentAuthority}) {
    if (!this.extractor?.capability().configured) throw codedError('HIPICO_DOCUMENT_EXTRACTOR_NOT_CONFIGURED');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      const extraction=await this.extractor.extract(input.pdf,controller.signal);
      if(extraction.pageCount&&extraction.pageCount>MAX_PDF_PAGES)throw codedError('PDF_PAGE_LIMIT_EXCEEDED');
      const text=extraction.text.slice(0,MAX_EXTRACTED_TEXT_CHARS);
      const claimed=classifyDocumentText(text);const classified=authorizeDocumentClassification(claimed,input.authority);
      const structured=parseHorseRacingDocument(text);
      const reconciliation=reconcileDocumentExtraction({classification:classified.classification,authority:input.authority,confidence:classified.confidence,parsed:structured});
      await this.store.updateExtraction(input.id,input.ownerId,input.groupKey,{
        ...classified,parserVersion:extraction.parserVersion,status:classified.classification==='UNKNOWN'?'review':'extracted',
        extraction:{status:'extracted',documentId:input.id,sha256:input.envelope.sha256,method:extraction.method,text,pageCount:extraction.pageCount??input.envelope.pageCountEstimate,claimedClassification:claimed.classification,classification:classified.classification,authority:input.authority,confidence:classified.confidence,claimedOfficial:classified.claimedOfficial,structured,reconciliation}
      });
      return {...classified,structured,reconciliation,extractionStatus:'extracted' as const};
    } catch (error:any) {
      const normalized=safeExtractionError(error);
      try{
        await this.store.markExtractionFailed(input.id,input.ownerId,input.groupKey,String(normalized.code||'HIPICO_DOCUMENT_EXTRACTION_FAILED'));
      }catch(auditError){
        const failure=codedError('HIPICO_DOCUMENT_FAILURE_AUDIT_FAILED');
        (failure as any).cause=auditError;
        throw failure;
      }
      throw normalized;
    } finally {clearTimeout(timer);}
  }

  async ingest(input:{ownerId:string;groupKey:string;pdf:Buffer;filename?:string;mimeType?:string;provenance:DocumentProvenance;supersedesId?:string|null}){
    const provenance=validateDocumentProvenance(input.provenance);
    const envelope=validatePdfEnvelope(input.pdf,input.filename,input.mimeType??'application/pdf');
    const base=await this.store.put({ownerId:input.ownerId,groupKey:input.groupKey,envelope,pdf:input.pdf,provenance,classification:'UNKNOWN',confidence:0,parserVersion:null,extraction:{status:'not_extracted'},supersedesId:input.supersedesId});
    if(!this.extractor?.capability().configured)return {...base,envelope,classification:'UNKNOWN' as const,extractionStatus:base.duplicate?'duplicate' as const:'not_configured' as const};
    const claimed=await this.store.claimExtraction(base.id,input.ownerId,input.groupKey,false);
    if(!claimed){
      if(!base.duplicate)throw codedError('HIPICO_DOCUMENT_EXTRACTION_CLAIM_FAILED');
      const pending=base.status==='uploaded'||base.status==='failed';
      return {...base,envelope,classification:'UNKNOWN' as const,extractionStatus:pending?'processing' as const:'duplicate' as const};
    }
    const authority=base.duplicate?await this.store.getAuthority(input.ownerId,input.groupKey,base.id):provenance.authority;
    return {...base,envelope,...await this.extractAndPersist({id:base.id,ownerId:input.ownerId,groupKey:input.groupKey,pdf:input.pdf,envelope,authority})};
  }

  async reprocessExisting(input:{id:string;ownerId:string;groupKey:string;filename?:string}){
    if (!this.extractor?.capability().configured) throw codedError('HIPICO_DOCUMENT_EXTRACTOR_NOT_CONFIGURED');
    const pdf=await this.store.getRaw(input.ownerId,input.groupKey,input.id);if(!pdf)throw codedError('HIPICO_DOCUMENT_NOT_FOUND');
    const envelope=validatePdfEnvelope(pdf,input.filename??'document.pdf');const authority=await this.store.getAuthority(input.ownerId,input.groupKey,input.id);
    const claimed=await this.store.claimExtraction(input.id,input.ownerId,input.groupKey,true);if(!claimed)throw codedError('HIPICO_DOCUMENT_EXTRACTION_IN_PROGRESS');
    const extracted=await this.extractAndPersist({id:input.id,ownerId:input.ownerId,groupKey:input.groupKey,pdf,envelope,authority});
    return {id:input.id,envelope,...extracted};
  }
}
