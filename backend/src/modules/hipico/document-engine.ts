import crypto from 'node:crypto';

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

function decodePdfNameEscapes(source:string){
  return source.replace(/#([0-9a-fA-F]{2})/g,(_match,hex)=>String.fromCharCode(Number.parseInt(hex,16)));
}

export function safeDocumentFilename(value: unknown) {
  const base = String(value || 'document.pdf').replace(/[\\/\u0000-\u001f\u007f]+/g,'_').trim().slice(0,180) || 'document.pdf';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

export function validateDocumentProvenance(provenance: DocumentProvenance) {
  const receivedAt = new Date(provenance.receivedAt);
  if (!Number.isFinite(receivedAt.getTime())) throw Object.assign(new Error('DOCUMENT_RECEIVED_AT_INVALID'),{code:'DOCUMENT_RECEIVED_AT_INVALID'});
  const sourceChannel = String(provenance.sourceChannel || '').trim();
  if (!sourceChannel || sourceChannel.length > 120) throw Object.assign(new Error('DOCUMENT_SOURCE_CHANNEL_INVALID'),{code:'DOCUMENT_SOURCE_CHANNEL_INVALID'});
  const sourceMessageId = provenance.sourceMessageId == null ? null : String(provenance.sourceMessageId).trim();
  if (sourceMessageId && sourceMessageId.length > 320) throw Object.assign(new Error('DOCUMENT_SOURCE_MESSAGE_ID_INVALID'),{code:'DOCUMENT_SOURCE_MESSAGE_ID_INVALID'});
  const sender = provenance.sender == null ? null : String(provenance.sender).trim();
  if (sender && sender.length > 220) throw Object.assign(new Error('DOCUMENT_SENDER_INVALID'),{code:'DOCUMENT_SENDER_INVALID'});
  return {
    sourceChannel,
    sourceMessageId,
    sender,
    receivedAt: receivedAt.toISOString(),
    authority: provenance.authority
  } satisfies DocumentProvenance;
}

export function validatePdfEnvelope(pdf: Buffer, filename?: string): PdfEnvelope {
  if (!Buffer.isBuffer(pdf) || pdf.length === 0) throw Object.assign(new Error('PDF_EMPTY'),{code:'PDF_EMPTY'});
  if (pdf.length > MAX_PDF_BYTES) throw Object.assign(new Error('PDF_TOO_LARGE'),{code:'PDF_TOO_LARGE'});
  if (!pdf.subarray(0,8).toString('latin1').startsWith('%PDF-')) throw Object.assign(new Error('PDF_MAGIC_INVALID'),{code:'PDF_MAGIC_INVALID'});
  const source = pdf.toString('latin1');
  const tail = source.slice(Math.max(0, source.length - 2048));
  if (!/%%EOF\s*$/m.test(tail) || !/\bobj\b[\s\S]*\bendobj\b/.test(source)) {
    throw Object.assign(new Error('PDF_STRUCTURE_INVALID'),{code:'PDF_STRUCTURE_INVALID'});
  }
  const decodedNames=decodePdfNameEscapes(source);
  for (const token of ACTIVE_PDF_TOKENS) if (token.test(decodedNames)) throw Object.assign(new Error('PDF_ACTIVE_CONTENT_REJECTED'),{code:'PDF_ACTIVE_CONTENT_REJECTED'});
  const pageCountEstimate = Math.max(1,(decodedNames.match(/\/Type\s*\/Page\b/g)||[]).length);
  if (pageCountEstimate > MAX_PDF_PAGES) throw Object.assign(new Error('PDF_PAGE_LIMIT_EXCEEDED'),{code:'PDF_PAGE_LIMIT_EXCEEDED'});
  return { sha256: crypto.createHash('sha256').update(pdf).digest('hex'), sizeBytes: pdf.length, pageCountEstimate, filename: safeDocumentFilename(filename), mime:'application/pdf' };
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

export function authorizeDocumentClassification(
  candidate:{classification:DocumentClassification;confidence:number},
  authority:DocumentAuthority
) {
  if(candidate.classification==='OFFICIAL_RESULT'&&authority!=='official'){
    return {classification:'RESULT' as const,confidence:Math.min(candidate.confidence,0.9),claimedOfficial:true};
  }
  return {...candidate,claimedOfficial:candidate.classification==='OFFICIAL_RESULT'};
}

export type DocumentStoreInput = {
  ownerId:string;
  groupKey:string;
  envelope:PdfEnvelope;
  pdf:Buffer;
  provenance:DocumentProvenance;
  classification:DocumentClassification;
  confidence:number;
  parserVersion:string|null;
  extraction:Record<string,unknown>;
  supersedesId?:string|null;
};

export interface DocumentStore {
  put(input:DocumentStoreInput):Promise<{id:string;duplicate:boolean}>;
  updateExtraction(id:string,ownerId:string,groupKey:string,input:{classification:DocumentClassification;confidence:number;parserVersion:string;status:'extracted'|'review';extraction:Record<string,unknown>}):Promise<void>;
  getRaw(ownerId:string,groupKey:string,id:string):Promise<Buffer|null>;
  getAuthority(ownerId:string,groupKey:string,id:string):Promise<DocumentAuthority>;
}

export class DocumentIngestionService {
  constructor(private readonly store:DocumentStore, private readonly extractor:PdfTextExtractor|null = null, private readonly timeoutMs=8000) {}

  capability(){
    return this.extractor?.capability() || {configured:false,nativeText:false,ocr:false,parserVersion:null};
  }

  private async extractAndPersist(input:{id:string;ownerId:string;groupKey:string;pdf:Buffer;envelope:PdfEnvelope;authority:DocumentAuthority}) {
    if (!this.extractor?.capability().configured) {
      throw Object.assign(new Error('HIPICO_DOCUMENT_EXTRACTOR_NOT_CONFIGURED'),{code:'HIPICO_DOCUMENT_EXTRACTOR_NOT_CONFIGURED'});
    }
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      const extraction=await this.extractor.extract(input.pdf,controller.signal);
      const claimed=classifyDocumentText(extraction.text);
      const classified=authorizeDocumentClassification(claimed,input.authority);
      await this.store.updateExtraction(input.id,input.ownerId,input.groupKey,{
        ...classified,
        parserVersion:extraction.parserVersion,
        status:classified.classification==='UNKNOWN'?'review':'extracted',
        extraction:{
          status:'extracted',
          method:extraction.method,
          text:extraction.text.slice(0,MAX_EXTRACTED_TEXT_CHARS),
          pageCount:extraction.pageCount??input.envelope.pageCountEstimate,
          claimedClassification:claimed.classification,
          authority:input.authority,
          claimedOfficial:classified.claimedOfficial
        }
      });
      return {...classified,extractionStatus:'extracted' as const};
    } catch (error:any) {
      if (error?.name === 'AbortError') {
        throw Object.assign(new Error('HIPICO_DOCUMENT_EXTRACTION_TIMEOUT'),{code:'HIPICO_DOCUMENT_EXTRACTION_TIMEOUT'});
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async ingest(input:{ownerId:string;groupKey:string;pdf:Buffer;filename?:string;provenance:DocumentProvenance;supersedesId?:string|null}){
    const provenance=validateDocumentProvenance(input.provenance);
    const envelope=validatePdfEnvelope(input.pdf,input.filename);
    const base=await this.store.put({
      ownerId:input.ownerId,
      groupKey:input.groupKey,
      envelope,
      pdf:input.pdf,
      provenance,
      classification:'UNKNOWN',
      confidence:0,
      parserVersion:null,
      extraction:{status:'not_extracted'},
      supersedesId:input.supersedesId
    });
    if(base.duplicate)return {...base,envelope,classification:'UNKNOWN' as const,extractionStatus:'duplicate' as const};
    if(!this.extractor?.capability().configured)return {...base,envelope,classification:'UNKNOWN' as const,extractionStatus:'not_configured' as const};
    return {...base,envelope,...await this.extractAndPersist({id:base.id,ownerId:input.ownerId,groupKey:input.groupKey,pdf:input.pdf,envelope,authority:provenance.authority})};
  }

  async reprocessExisting(input:{id:string;ownerId:string;groupKey:string;filename?:string}){
    const pdf=await this.store.getRaw(input.ownerId,input.groupKey,input.id);
    if(!pdf)throw Object.assign(new Error('HIPICO_DOCUMENT_NOT_FOUND'),{code:'HIPICO_DOCUMENT_NOT_FOUND'});
    const envelope=validatePdfEnvelope(pdf,input.filename);
    const authority=await this.store.getAuthority(input.ownerId,input.groupKey,input.id);
    const extracted=await this.extractAndPersist({id:input.id,ownerId:input.ownerId,groupKey:input.groupKey,pdf,envelope,authority});
    return {id:input.id,envelope,...extracted};
  }
}
