import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';

const router = Router();
router.use(requireTenant);

const periodSchema=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/,'Usa formato AAAA-MM.');
const moduleSchema=z.enum(['fiscal','iva','islr','igtf','retiva','municipal']);
const documentKindSchema=z.enum(['invoice','credit_note','debit_note','withholding','tax_return','supporting_document','other']);
const createPeriodSchema=z.object({period:periodSchema,module:moduleSchema,note:z.string().trim().max(500).optional()}).strict();
const closeSchema=z.object({period:periodSchema,module:moduleSchema,note:z.string().trim().max(500).optional()}).strict();
const reopenSchema=z.object({period:periodSchema,module:moduleSchema,reason:z.string().trim().min(5).max(500)}).strict();
const fiscalSchema=z.object({
  kind:documentKindSchema,number:z.string().trim().min(1).max(120),period:periodSchema,module:moduleSchema,
  payload:z.record(z.string(),z.unknown()).default({})
}).strict();

const context=(req:any)=>req.context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};

async function hasPermission(tenantId:string,userId:string|undefined,key:string){
  if(!userId)return false;
  return (await prisma.userRole.count({where:{userId,role:{tenantId,permissions:{some:{permission:{key}}}}}}))>0;
}
async function capabilities(ctx:ReturnType<typeof context>){
  const [read,manageDocuments,close,reopen]=await Promise.all([
    hasPermission(ctx.tenantId,ctx.userId,'fiscal.read'),hasPermission(ctx.tenantId,ctx.userId,'fiscal.manage_documents'),hasPermission(ctx.tenantId,ctx.userId,'fiscal.close'),hasPermission(ctx.tenantId,ctx.userId,'fiscal.reopen')
  ]);
  return {read,manageDocuments,close,reopen};
}
const stable=(value:any):any=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map((key)=>[key,stable(value[key])])):value;

router.get('/periods',requirePermission('fiscal.read'),asyncHandler(async(req,res)=>{
  const ctx=context(req);const periods=await prisma.closingPeriod.findMany({where:{tenantId:ctx.tenantId,module:{in:moduleSchema.options}},orderBy:[{period:'desc'},{module:'asc'}],take:240});
  ok(res,{periods,modules:moduleSchema.options,capabilities:await capabilities(ctx)});
}));

router.post('/periods',requirePermission('fiscal.close'),validateBody(createPeriodSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req);const existing=await prisma.closingPeriod.findFirst({where:{tenantId:ctx.tenantId,period:req.body.period,module:req.body.module}});
  if(existing)throw new HttpError(409,'El período fiscal ya está registrado.',{code:'FISCAL_PERIOD_EXISTS',status:existing.status});
  const created=await prisma.closingPeriod.create({data:{tenantId:ctx.tenantId,period:req.body.period,module:req.body.module,status:'open',note:req.body.note||null}});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'fiscal.period.created',entity:'ClosingPeriod',entityId:created.id,after:created,ipAddress:ctx.ip,userAgent:ctx.userAgent});
  ok(res,created);
}));

router.post('/close-period',requirePermission('fiscal.close'),validateBody(closeSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req);const existing=await prisma.closingPeriod.findFirst({where:{tenantId:ctx.tenantId,period:req.body.period,module:req.body.module}});
  if(!existing)throw new HttpError(404,'Período fiscal no encontrado; créalo abierto antes de cerrar.',{code:'FISCAL_PERIOD_NOT_FOUND'});
  if(existing.status!=='open')throw new HttpError(409,'Transición fiscal inválida: sólo un período abierto puede cerrarse.',{code:'FISCAL_INVALID_TRANSITION',from:existing.status,to:'closed'});
  const updated=await prisma.closingPeriod.update({where:{id:existing.id},data:{status:'closed',closedAt:new Date(),closedBy:ctx.userId||'session-user',note:req.body.note||existing.note||null}});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'fiscal.period.closed',entity:'ClosingPeriod',entityId:updated.id,before:existing,after:updated,ipAddress:ctx.ip,userAgent:ctx.userAgent});
  ok(res,updated);
}));

router.post('/reopen-period',requirePermission('fiscal.reopen'),validateBody(reopenSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req);const existing=await prisma.closingPeriod.findFirst({where:{tenantId:ctx.tenantId,period:req.body.period,module:req.body.module}});
  if(!existing)throw new HttpError(404,'Período fiscal no encontrado.',{code:'FISCAL_PERIOD_NOT_FOUND'});
  if(existing.status!=='closed')throw new HttpError(409,'Transición fiscal inválida: sólo un período cerrado puede reabrirse.',{code:'FISCAL_INVALID_TRANSITION',from:existing.status,to:'open'});
  const updated=await prisma.closingPeriod.update({where:{id:existing.id},data:{status:'open',closedAt:null,closedBy:null,note:req.body.reason}});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'fiscal.period.reopened',entity:'ClosingPeriod',entityId:updated.id,before:existing,after:{...updated,reopenReason:req.body.reason},ipAddress:ctx.ip,userAgent:ctx.userAgent});
  ok(res,{...updated,reopenReason:req.body.reason});
}));

router.post('/documents',requirePermission('fiscal.manage_documents'),validateBody(fiscalSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req);const payloadSize=Buffer.byteLength(JSON.stringify(req.body.payload),'utf8');if(payloadSize>256_000)throw new HttpError(413,'El payload del documento fiscal supera 256 KB.',{code:'FISCAL_DOCUMENT_PAYLOAD_TOO_LARGE'});
  const period=await prisma.closingPeriod.findFirst({where:{tenantId:ctx.tenantId,period:req.body.period,module:{in:req.body.module==='fiscal'?['fiscal']:[req.body.module,'fiscal']},status:'closed'}});
  if(period)throw new HttpError(409,`El período ${req.body.period} está cerrado para ${period.module}.`,{code:'FISCAL_PERIOD_CLOSED',period:req.body.period,module:period.module});
  const existing=await prisma.fiscalDocument.findUnique({where:{tenantId_kind_number:{tenantId:ctx.tenantId,kind:req.body.kind,number:req.body.number}}});
  if(existing)throw new HttpError(409,'Documento fiscal duplicado.',{code:'FISCAL_DOCUMENT_DUPLICATE'});
  const controlledPayload={...req.body.payload,_fiscalModule:req.body.module};
  const hash=crypto.createHash('sha256').update(JSON.stringify(stable({tenantId:ctx.tenantId,kind:req.body.kind,number:req.body.number,period:req.body.period,module:req.body.module,payload:controlledPayload}))).digest('hex');
  const record=await prisma.fiscalDocument.create({data:{tenantId:ctx.tenantId,kind:req.body.kind,number:req.body.number,period:req.body.period,status:'issued',payload:controlledPayload,hash}});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'fiscal.document.created',entity:'FiscalDocument',entityId:record.id,after:{id:record.id,kind:record.kind,number:record.number,period:record.period,module:req.body.module,status:record.status,hash:record.hash},ipAddress:ctx.ip,userAgent:ctx.userAgent});
  res.status(201).json({ok:true,data:{...record,module:req.body.module}});
}));

router.get('/documents',requirePermission('fiscal.read'),asyncHandler(async(req,res)=>{
  const ctx=context(req);const period=req.query.period?String(req.query.period):undefined;if(period&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new HttpError(422,'Período inválido.',{code:'FISCAL_PERIOD_INVALID'});
  const rows=await prisma.fiscalDocument.findMany({where:{tenantId:ctx.tenantId,...(period?{period}:{})},orderBy:{createdAt:'desc'},take:200});
  ok(res,rows.map((row:any)=>({...row,module:row.payload?._fiscalModule||'fiscal'})));
}));

export default router;
