import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import {
  PAYABLE_ALLOWED_MIME,
  PAYABLE_MAX_BYTES,
  confirmPayableReview,
  getPayableContent,
  getPayableDocument,
  ingestPayableDocument,
  listPayableDocuments,
  processPayableDocument,
  rejectPayableReview
} from './payables.service.js';

const router = Router();
router.use(requireTenant, requirePermission('purchases.manage'));
const context = (req:any) => req.context as { tenantId:string; userId?:string; ip?:string; userAgent?:string };
const actor = (req:any) => {
  const userId = String(context(req).userId || '').trim();
  if (!userId) throw new HttpError(401, 'La revisión de cuentas por pagar requiere un usuario autenticado.');
  return userId;
};

const reprocessSchema = z.object({ version:z.enum(['1.0.0','2.0.0']).default('2.0.0') });
const reviewSchema = z.object({
  confirmedFields:z.array(z.string().min(1)).default([]),
  corrections:z.record(z.string(),z.unknown()).default({})
});
const rejectSchema = z.object({ reason:z.string().trim().min(3).max(500) });

function safeFileName(value:string) {
  return value.replace(/[\\/\0\r\n]/g,'_').replace(/[^\p{L}\p{N}._() -]/gu,'_').slice(0,240) || 'documento';
}

async function collectBody(req:Request, maxBytes:number) {
  const chunks:Buffer[] = [];
  let total = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any);
    total += buffer.length;
    if (total > maxBytes) { tooLarge = true; continue; }
    chunks.push(buffer);
  }
  if (tooLarge) throw new HttpError(413, 'El documento excede el límite de 8 MiB.', { code:'PAYABLE_FILE_TOO_LARGE', maxBytes:PAYABLE_MAX_BYTES });
  return Buffer.concat(chunks);
}

function parseMultipart(body:Buffer, contentType:string) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2]?.trim();
  if (!boundary || boundary.length > 200) throw new HttpError(400, 'Multipart boundary inválido.', { code:'PAYABLE_MULTIPART_INVALID' });
  const delimiter = Buffer.from(`--${boundary}`);
  let cursor = 0;
  while (cursor < body.length) {
    const start = body.indexOf(delimiter,cursor);
    if (start < 0) break;
    const headerStart = start + delimiter.length + 2;
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'),headerStart);
    if (headerEnd < 0) break;
    const headers = body.subarray(headerStart,headerEnd).toString('utf8');
    const next = body.indexOf(delimiter,headerEnd + 4);
    if (next < 0) break;
    const disposition = headers.match(/content-disposition:\s*form-data;[^\r\n]*/i)?.[0] || '';
    const name = disposition.match(/name="([^"]+)"/i)?.[1];
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1];
    if (name === 'file' && filename != null) {
      const partType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase() || '';
      let end = next;
      if (body[end-2] === 0x0d && body[end-1] === 0x0a) end -= 2;
      return { bytes:body.subarray(headerEnd+4,end), fileName:safeFileName(filename), mimeType:partType };
    }
    cursor = next;
  }
  throw new HttpError(400, 'No se encontró el campo file en el upload.', { code:'PAYABLE_FILE_PART_MISSING' });
}

async function readUpload(req:Request) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.startsWith('multipart/form-data')) {
    const body = await collectBody(req,PAYABLE_MAX_BYTES + 64*1024);
    return parseMultipart(body,contentType);
  }
  const mimeType = contentType.split(';')[0].trim();
  if (!PAYABLE_ALLOWED_MIME.has(mimeType)) throw new HttpError(415,'Usa multipart/form-data o envía directamente PDF/JPG/PNG/WebP.',{code:'PAYABLE_UPLOAD_CONTENT_TYPE_REQUIRED'});
  return {
    bytes:await collectBody(req,PAYABLE_MAX_BYTES),
    fileName:safeFileName(String(req.headers['x-file-name'] || 'documento')),
    mimeType
  };
}

router.get('/documents',asyncHandler(async(req,res)=>{
  const {tenantId}=context(req);
  ok(res,await listPayableDocuments(tenantId,Number(req.query.take||100)));
}));

router.post('/documents',asyncHandler(async(req,res)=>{
  const ctx=context(req);
  const userId=actor(req);
  const upload=await readUpload(req);
  const result=await ingestPayableDocument({
    tenantId:ctx.tenantId,userId,fileName:upload.fileName,mimeType:upload.mimeType,bytes:upload.bytes,
    sourceMetadata:{ channel:'ui-or-api', receivedAt:new Date().toISOString() }
  });
  await writeAudit({tenantId:ctx.tenantId,userId,action:result.duplicate?'payables.document.deduplicated':'payables.document.ingested',entity:'PayableDocument',entityId:result.document.id,after:{hash:result.document.documentHash,mimeType:result.document.mimeType,sizeBytes:result.document.sizeBytes,state:result.document.state,exactHash:result.exactHash},ipAddress:ctx.ip,userAgent:ctx.userAgent});
  ok(res,result,result.duplicate?200:201);
}));

router.get('/documents/:id',asyncHandler(async(req,res)=>{
  ok(res,await getPayableDocument(context(req).tenantId,req.params.id));
}));

router.get('/documents/:id/content',asyncHandler(async(req,res)=>{
  const content=await getPayableContent(context(req).tenantId,req.params.id);
  res.setHeader('Content-Type',content.mimeType);
  res.setHeader('Content-Disposition',`inline; filename="${safeFileName(content.fileName)}"`);
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('ETag',`"sha256-${content.hash}"`);
  res.status(200).send(content.bytes);
}));

router.post('/documents/:id/reprocess',validateBody(reprocessSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req); const userId=actor(req);
  const document=await processPayableDocument(ctx.tenantId,req.params.id,req.body.version);
  await writeAudit({tenantId:ctx.tenantId,userId,action:'payables.document.reprocessed',entity:'PayableDocument',entityId:req.params.id,after:{parserVersion:req.body.version,state:document.state},ipAddress:ctx.ip,userAgent:ctx.userAgent});
  ok(res,await getPayableDocument(ctx.tenantId,req.params.id));
}));

router.post('/documents/:id/review',validateBody(reviewSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req); const userId=actor(req);
  const result=await confirmPayableReview({tenantId:ctx.tenantId,userId,documentId:req.params.id,confirmedFields:req.body.confirmedFields,corrections:req.body.corrections});
  await writeAudit({tenantId:ctx.tenantId,userId,action:'payables.review.confirmed',entity:'PayableDocument',entityId:req.params.id,after:{purchaseInvoiceId:result.purchase.id,status:result.purchase.status,idempotent:result.idempotent},ipAddress:ctx.ip,userAgent:ctx.userAgent});
  ok(res,result);
}));

router.post('/documents/:id/reject',validateBody(rejectSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req); const userId=actor(req);
  const document=await rejectPayableReview(ctx.tenantId,userId,req.params.id,req.body.reason);
  await writeAudit({tenantId:ctx.tenantId,userId,action:'payables.review.rejected',entity:'PayableDocument',entityId:req.params.id,after:{reason:req.body.reason},ipAddress:ctx.ip,userAgent:ctx.userAgent});
  ok(res,document);
}));

export default router;
