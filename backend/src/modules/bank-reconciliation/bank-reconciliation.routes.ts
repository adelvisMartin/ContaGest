import { Router, type Request } from 'express';
import { z } from 'zod';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { decimalSchema } from '../../shared/financial/zod.js';
import { MAX_STATEMENT_BYTES } from './statement-parser.js';
import {
  createReconciliationModel,
  createWriteoff,
  getClosingBalanceSummary,
  getMatchingCandidates,
  getReconciliationHistory,
  importBankStatement,
  listReconciliationModels,
  listStatementImports,
  listStatementLines,
  reconcileStatementLine,
  reverseReconciliation,
  type TargetType
} from './bank-reconciliation.service.js';

const router=Router();
router.use(requireTenant,requirePermission('banking.manage'));
const context=(req:any)=>req.context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
const actor=(req:any)=>{const value=String(context(req).userId||'').trim();if(!value)throw new HttpError(401,'La conciliación bancaria requiere un usuario autenticado.');return value;};
const idem=(req:any)=>String(req.header('Idempotency-Key')||'').trim();

const reconcileSchema=z.object({
  allocations:z.array(z.object({targetType:z.enum(['bank_movement','sales_invoice','purchase_invoice','ledger_entry','transfer']),targetId:z.string().uuid(),amount:decimalSchema('money',{positive:true})}).strict()).min(1).max(50),
  confidence:z.number().min(0).max(1).optional(),
  reasons:z.array(z.string().trim().min(1).max(80)).max(20).optional()
}).strict();
const modelSchema=z.object({
  name:z.string().trim().min(2).max(160),memoPattern:z.string().trim().min(2).max(240),accountCode:z.string().trim().min(1).max(80),accountName:z.string().trim().min(2).max(160).optional(),reasonCode:z.string().trim().min(2).max(64),autoApply:z.boolean().default(false),minConfidence:z.string().regex(/^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/).default('0.9500')
}).strict();
const writeoffSchema=z.object({
  amount:decimalSchema('money',{positive:true}),writeoffAccountCode:z.string().trim().min(1).max(80),bankLedgerAccountCode:z.string().trim().min(1).max(80),reason:z.string().trim().min(5).max(500),fiscalPeriod:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),approvalRequestId:z.string().uuid().nullable().optional()
}).strict();
const reverseSchema=z.object({reason:z.string().trim().min(5).max(500),fiscalPeriod:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional()}).strict();

function safeFileName(value:string){return value.replace(/[\\/\0\r\n]/g,'_').replace(/[^\p{L}\p{N}._() -]/gu,'_').slice(0,240)||'extracto';}
async function collectBody(req:Request,maxBytes:number){const chunks:Buffer[]=[];let total=0;let tooLarge=false;for await(const chunk of req){const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk as any);total+=buffer.length;if(total>maxBytes){tooLarge=true;continue;}chunks.push(buffer);}if(tooLarge)throw new HttpError(413,'El extracto excede el límite de 5 MiB.',{code:'BANK_STATEMENT_TOO_LARGE',maxBytes:MAX_STATEMENT_BYTES});return Buffer.concat(chunks);}
function parseMultipart(body:Buffer,contentType:string){const match=contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);const boundary=match?.[1]||match?.[2]?.trim();if(!boundary||boundary.length>200)throw new HttpError(400,'Multipart boundary inválido.',{code:'BANK_STATEMENT_MULTIPART_INVALID'});const delimiter=Buffer.from(`--${boundary}`);let cursor=0;while(cursor<body.length){const start=body.indexOf(delimiter,cursor);if(start<0)break;const headerStart=start+delimiter.length+2;const headerEnd=body.indexOf(Buffer.from('\r\n\r\n'),headerStart);if(headerEnd<0)break;const headers=body.subarray(headerStart,headerEnd).toString('utf8');const next=body.indexOf(delimiter,headerEnd+4);if(next<0)break;const disposition=headers.match(/content-disposition:\s*form-data;[^\r\n]*/i)?.[0]||'';const name=disposition.match(/name="([^"]+)"/i)?.[1];const filename=disposition.match(/filename="([^"]*)"/i)?.[1];if(name==='file'&&filename!=null){let end=next;if(body[end-2]===0x0d&&body[end-1]===0x0a)end-=2;return {bytes:body.subarray(headerEnd+4,end),fileName:safeFileName(filename),mimeType:headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase()||''};}cursor=next;}throw new HttpError(400,'No se encontró el campo file en el upload.',{code:'BANK_STATEMENT_FILE_PART_MISSING'});}
async function readUpload(req:Request){const contentType=String(req.headers['content-type']||'').toLowerCase();if(contentType.startsWith('multipart/form-data')){const body=await collectBody(req,MAX_STATEMENT_BYTES+64*1024);return parseMultipart(body,contentType);}return {bytes:await collectBody(req,MAX_STATEMENT_BYTES),fileName:safeFileName(String(req.headers['x-file-name']||'extracto.csv')),mimeType:contentType.split(';')[0].trim()};}

router.get('/imports',asyncHandler(async(req,res)=>{ok(res,await listStatementImports(context(req).tenantId,String(req.query.accountId||'')||undefined,Number(req.query.take||50)));}));
router.get('/lines',asyncHandler(async(req,res)=>{ok(res,await listStatementLines(context(req).tenantId,{accountId:String(req.query.accountId||'')||undefined,status:String(req.query.status||'all'),take:Number(req.query.take||200)}));}));
router.get('/lines/:id/candidates',asyncHandler(async(req,res)=>{ok(res,await getMatchingCandidates(context(req).tenantId,req.params.id));}));
router.get('/lines/:id/history',asyncHandler(async(req,res)=>{ok(res,await getReconciliationHistory(context(req).tenantId,req.params.id));}));
router.get('/models',asyncHandler(async(req,res)=>{ok(res,await listReconciliationModels(context(req).tenantId));}));
router.get('/closing-balance',asyncHandler(async(req,res)=>{const accountId=String(req.query.accountId||'');if(!accountId)throw new HttpError(422,'accountId es obligatorio.');ok(res,await getClosingBalanceSummary(context(req).tenantId,accountId,String(req.query.importId||'')||undefined));}));

router.post('/imports',asyncHandler(async(req,res)=>{const ctx=context(req);const userId=actor(req);const accountId=String(req.query.accountId||req.header('x-bank-account-id')||'');if(!accountId)throw new HttpError(422,'Selecciona la cuenta bancaria del extracto.');const upload=await readUpload(req);const result=await importBankStatement({tenantId:ctx.tenantId,userId,accountId,fileName:upload.fileName,mimeType:upload.mimeType,bytes:upload.bytes,sourceMetadata:{channel:'ui-or-api',receivedAt:new Date().toISOString()}});res.setHeader('X-Resource-Id',result.importId);ok(res,result,result.duplicate?200:201);}));
router.post('/lines/:id/reconcile',validateBody(reconcileSchema),asyncHandler(async(req,res)=>{const ctx=context(req);const result=await reconcileStatementLine({tenantId:ctx.tenantId,userId:actor(req),lineId:req.params.id,idempotencyKey:idem(req),allocations:req.body.allocations as Array<{targetType:TargetType;targetId:string;amount:string}>,confidence:req.body.confidence,reasons:req.body.reasons});res.setHeader('Idempotency-Replayed',result.replayed?'true':'false');res.setHeader('X-Resource-Id',result.reconciliation.id);ok(res,result);}));
router.post('/models',validateBody(modelSchema),asyncHandler(async(req,res)=>{const ctx=context(req);const result=await createReconciliationModel({tenantId:ctx.tenantId,userId:actor(req),...req.body});res.setHeader('X-Resource-Id',result.id);ok(res,result,201);}));
router.post('/lines/:id/write-off',validateBody(writeoffSchema),asyncHandler(async(req,res)=>{const ctx=context(req);const result=await createWriteoff({tenantId:ctx.tenantId,userId:actor(req),lineId:req.params.id,idempotencyKey:idem(req),...req.body,approvalRequestId:req.body.approvalRequestId||req.header('x-approval-request-id')||null});res.setHeader('Idempotency-Replayed',result.replayed?'true':'false');res.setHeader('X-Resource-Id',result.reconciliation.id);ok(res,result);}));
router.post('/reconciliations/:id/reverse',validateBody(reverseSchema),asyncHandler(async(req,res)=>{const ctx=context(req);const result=await reverseReconciliation({tenantId:ctx.tenantId,userId:actor(req),reconciliationId:req.params.id,reason:req.body.reason,fiscalPeriod:req.body.fiscalPeriod});res.setHeader('Idempotency-Replayed',result.replayed?'true':'false');ok(res,result);}));

export default router;
