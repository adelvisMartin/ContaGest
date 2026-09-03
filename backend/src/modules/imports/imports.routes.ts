import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { decimalSchema } from '../../shared/financial/zod.js';
import { serializeDecimal, ZERO } from '../../shared/financial/decimal.js';
import { runFinancialIdempotentMutation } from '../../shared/services/financial-idempotency.service.js';
import { writeAudit } from '../../shared/services/audit.service.js';

const router = Router();
router.use(requireTenant, requirePermission('admin.manage'));

const importTypeSchema = z.enum(['clients','suppliers','inventory','accounts','payroll']);
const duplicatePolicySchema = z.enum(['update','skip','error']);
const previewSchema = z.object({
  type: importTypeSchema,
  filename: z.string().trim().max(180).optional(),
  templateVersion: z.literal('v1').default('v1'),
  duplicatePolicy: duplicatePolicySchema.default('error'),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000)
}).strict();
const commitSchema = z.object({ confirm: z.literal(true), checksum: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

const clientRow = z.object({
  rif:z.string().trim().min(5).max(40), name:z.string().trim().min(2).max(180), contact:z.string().trim().max(180).optional(),
  email:z.string().trim().email().max(180).optional(), phone:z.string().trim().max(60).optional(), address:z.string().trim().max(500).optional(),
  fiscalType:z.string().trim().max(60).optional()
}).strict();
const supplierRow = z.object({
  rif:z.string().trim().min(5).max(40), name:z.string().trim().min(2).max(180), contact:z.string().trim().max(180).optional(),
  email:z.string().trim().email().max(180).optional(), phone:z.string().trim().max(60).optional(), address:z.string().trim().max(500).optional(),
  retentionProfile:z.string().trim().max(80).optional()
}).strict();
const productRow = z.object({
  sku:z.string().trim().min(1).max(80), name:z.string().trim().min(2).max(180), description:z.string().trim().max(500).optional(),
  unit:z.string().trim().max(20).optional(), cost:decimalSchema('money',{nonnegative:true}).optional(), price:decimalSchema('money',{nonnegative:true}).optional(),
  minStock:decimalSchema('quantity',{nonnegative:true}).optional(), taxRate:decimalSchema('percentage',{nonnegative:true}).optional(), barcode:z.string().trim().max(120).optional()
}).strict();
const accountRow = z.object({
  code:z.string().trim().min(1).max(40), name:z.string().trim().min(2).max(180), type:z.string().trim().min(2).max(40), nature:z.enum(['debit','credit']),
  level:z.coerce.number().int().min(1).max(12).default(1), parentCode:z.string().trim().max(40).optional(), allowPosting:z.boolean().default(true), description:z.string().trim().max(500).optional()
}).strict();
const payrollRow = z.object({
  idNumber:z.string().trim().min(4).max(40), fullName:z.string().trim().min(2).max(180), position:z.string().trim().min(2).max(120).default('Colaborador'),
  department:z.string().trim().max(120).optional(), hiredAt:z.coerce.date().optional(), salary:decimalSchema('money',{nonnegative:true}).optional()
}).strict();

type ImportType=z.infer<typeof importTypeSchema>;
type DuplicatePolicy=z.infer<typeof duplicatePolicySchema>;
type RowAction='create'|'update'|'skip'|'error';
type StagedRow={index:number;key:string;action:RowAction;normalized:any;errors:Array<{field:string;code:string;message:string}>};
type BatchPayload={version:1;templateVersion:'v1';checksum:string;duplicatePolicy:DuplicatePolicy;filename:string|null;createdBy:string|null;rows?:StagedRow[];report?:Array<{index:number;key:string;action:RowAction;status:string;errors:string[];entityId?:string}>;counts:{total:number;valid:number;invalid:number;created:number;updated:number;skipped:number};completedAt?:string};

const context=(req:any)=>req.context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
const requestId=(req:any)=>String(req.requestId||'')||null;
const idempotencyKey=(req:any)=>req.header('Idempotency-Key')||null;
const cleanString=(value:unknown)=>{const text=String(value??'').trim();return text||undefined;};
const bool=(value:unknown,defaultValue=true)=>{if(value===undefined||value===null||value==='')return defaultValue;const text=String(value).trim().toLowerCase();return !['false','0','no','n'].includes(text);};
const sanitizedFilename=(value?:string)=>{const clean=String(value||'import').replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,180);return clean||'import';};
const stable=(value:any):any=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'&&!Prisma.Decimal.isDecimal(value)&&!(value instanceof Date)?Object.fromEntries(Object.keys(value).sort().map((key)=>[key,stable(value[key])])):value instanceof Date?value.toISOString():Prisma.Decimal.isDecimal(value)?value.toString():value;
const checksum=(type:ImportType,version:string,rows:any[])=>createHash('sha256').update(JSON.stringify(stable({type,version,rows}))).digest('hex');
const expiresAt=(createdAt:Date)=>new Date(createdAt.getTime()+24*60*60*1000);
const ensureFresh=(batch:any)=>{if(Date.now()>expiresAt(batch.createdAt).getTime())throw new HttpError(409,'El batch de importación expiró; ejecuta un dry-run nuevo.',{code:'IMPORT_BATCH_EXPIRED'});};

function normalizeInput(type:ImportType,row:Record<string,unknown>){
  if(type==='clients')return {rif:cleanString(row.rif),name:cleanString(row.name),contact:cleanString(row.contact),email:cleanString(row.email),phone:cleanString(row.phone),address:cleanString(row.address),fiscalType:cleanString(row.fiscalType??row.type)};
  if(type==='suppliers')return {rif:cleanString(row.rif),name:cleanString(row.name),contact:cleanString(row.contact),email:cleanString(row.email),phone:cleanString(row.phone),address:cleanString(row.address),retentionProfile:cleanString(row.retentionProfile??row.category)};
  if(type==='inventory')return {sku:cleanString(row.sku),name:cleanString(row.name),description:cleanString(row.description??row.category),unit:cleanString(row.unit),cost:cleanString(row.cost??row.costUsd),price:cleanString(row.price??row.priceUsd),minStock:cleanString(row.minStock??row.min),taxRate:cleanString(row.taxRate),barcode:cleanString(row.barcode)};
  if(type==='accounts')return {code:cleanString(row.code),name:cleanString(row.name),type:cleanString(row.type),nature:cleanString(row.nature),level:row.level, parentCode:cleanString(row.parentCode),allowPosting:bool(row.allowPosting),description:cleanString(row.description)};
  return {idNumber:cleanString(row.idNumber),fullName:cleanString(row.fullName??row.employee),position:cleanString(row.position)||'Colaborador',department:cleanString(row.department),hiredAt:cleanString(row.hiredAt),salary:cleanString(row.salary)};
}

function parseRow(type:ImportType,row:Record<string,unknown>){
  if(type==='inventory'&&['stock','reserved'].some((field)=>row[field]!==undefined&&String(row[field]??'').trim()!=='')){
    return {success:false as const,issues:[{path:['stock/reserved'],code:'INVENTORY_BALANCE_REQUIRES_MOVEMENT_WORKFLOW',message:'Stock y reservas no se importan como campos maestros; usa el workflow auditable de inventario (#94).'}]};
  }
  const normalized=normalizeInput(type,row);
  const schema=type==='clients'?clientRow:type==='suppliers'?supplierRow:type==='inventory'?productRow:type==='accounts'?accountRow:payrollRow;
  const parsed=schema.safeParse(normalized);
  if(!parsed.success)return {success:false as const,issues:parsed.error.issues.map((issue)=>({path:issue.path,code:issue.code,message:issue.message}))};
  return {success:true as const,data:parsed.data};
}

const keyFor=(type:ImportType,row:any)=>String(type==='clients'||type==='suppliers'?row.rif:type==='inventory'?row.sku:type==='accounts'?row.code:row.idNumber);

async function existingKeys(type:ImportType,tenantId:string,keys:string[]){
  const unique=[...new Set(keys.filter(Boolean))];
  if(!unique.length)return new Map<string,string>();
  let rows:Array<{id:string;key:string}>=[];
  if(type==='clients')rows=(await prisma.client.findMany({where:{tenantId,rif:{in:unique}},select:{id:true,rif:true}})).map((r)=>({id:r.id,key:r.rif}));
  else if(type==='suppliers')rows=(await prisma.supplier.findMany({where:{tenantId,rif:{in:unique}},select:{id:true,rif:true}})).map((r)=>({id:r.id,key:r.rif}));
  else if(type==='inventory')rows=(await prisma.product.findMany({where:{tenantId,sku:{in:unique}},select:{id:true,sku:true}})).map((r)=>({id:r.id,key:r.sku}));
  else if(type==='accounts')rows=(await prisma.chartAccount.findMany({where:{tenantId,code:{in:unique}},select:{id:true,code:true}})).map((r)=>({id:r.id,key:r.code}));
  else rows=(await prisma.employee.findMany({where:{tenantId,idNumber:{in:unique}},select:{id:true,idNumber:true}})).map((r)=>({id:r.id,key:r.idNumber}));
  return new Map(rows.map((row)=>[row.key,row.id]));
}

function issue(field:string,code:string,message:string){return {field,code,message};}
function zodIssues(issues:Array<any>){return issues.map((item)=>issue(item.path?.join('.')||'row',String(item.code||'INVALID'),item.message));}

async function stageRows(type:ImportType,tenantId:string,rawRows:Array<Record<string,unknown>>,duplicatePolicy:DuplicatePolicy){
  const parsed=rawRows.map((row,index)=>({index:index+1,result:parseRow(type,row)}));
  const validParsed=parsed.filter((item)=>item.result.success) as Array<{index:number;result:{success:true;data:any}}>;
  const keys=validParsed.map((item)=>keyFor(type,item.result.data));
  const existing=await existingKeys(type,tenantId,keys);
  const seen=new Set<string>();
  const plannedAccountCodes=type==='accounts'?new Set(keys):new Set<string>();
  const dbAccountCodes=type==='accounts'?new Set((await prisma.chartAccount.findMany({where:{tenantId},select:{code:true}})).map((r)=>r.code)):new Set<string>();
  return parsed.map(({index,result}):StagedRow=>{
    if(!result.success)return {index,key:`row-${index}`,action:'error',normalized:null,errors:zodIssues(result.issues)};
    const normalized=result.data;const key=keyFor(type,normalized);const errors:Array<{field:string;code:string;message:string}>=[];
    if(seen.has(key))errors.push(issue('key','IMPORT_DUPLICATE_IN_FILE',`La clave ${key} aparece más de una vez en el archivo.`));
    seen.add(key);
    if(type==='accounts'){
      const account=normalized as z.infer<typeof accountRow>;
      if(account.parentCode&&!dbAccountCodes.has(account.parentCode)&&!plannedAccountCodes.has(account.parentCode))errors.push(issue('parentCode','IMPORT_PARENT_NOT_FOUND',`La cuenta padre ${account.parentCode} no existe ni está incluida en el batch.`));
    }
    const duplicate=existing.has(key);
    let action:RowAction='create';
    if(duplicate){
      if(duplicatePolicy==='update')action='update';
      else if(duplicatePolicy==='skip')action='skip';
      else {action='error';errors.push(issue('key','IMPORT_DUPLICATE_EXISTS',`Ya existe un registro con clave ${key}.`));}
    }
    if(errors.length)action='error';
    return {index,key,action,normalized:stable(normalized),errors};
  });
}

function payloadOf(batch:any):BatchPayload{return (batch.payload||{}) as BatchPayload;}
function publicBatch(batch:any){
  const payload=payloadOf(batch);return {id:batch.id,type:batch.type,status:batch.status,filename:batch.filename,accepted:batch.accepted,rejected:batch.rejected,createdAt:batch.createdAt,expiresAt:expiresAt(batch.createdAt).toISOString(),checksum:payload.checksum,templateVersion:payload.templateVersion,duplicatePolicy:payload.duplicatePolicy,counts:payload.counts,rows:payload.rows?.map(({normalized,...row})=>({...row,row:normalized}))||undefined,report:payload.report};
}

async function applyRow(tx:Prisma.TransactionClient,type:ImportType,tenantId:string,row:StagedRow){
  if(row.action==='skip')return {status:'skipped',entityId:undefined};
  const data=row.normalized;
  if(type==='clients'){
    const record=row.action==='update'?await tx.client.update({where:{tenantId_rif:{tenantId,rif:data.rif}},data:{name:data.name,contact:data.contact||null,email:data.email||null,phone:data.phone||null,address:data.address||null,fiscalType:data.fiscalType||null}}):await tx.client.create({data:{tenantId,...data}});return {status:row.action==='update'?'updated':'created',entityId:record.id};
  }
  if(type==='suppliers'){
    const record=row.action==='update'?await tx.supplier.update({where:{tenantId_rif:{tenantId,rif:data.rif}},data:{name:data.name,contact:data.contact||null,email:data.email||null,phone:data.phone||null,address:data.address||null,retentionProfile:data.retentionProfile||null}}):await tx.supplier.create({data:{tenantId,...data}});return {status:row.action==='update'?'updated':'created',entityId:record.id};
  }
  if(type==='inventory'){
    const master={name:data.name,description:data.description||null,unit:data.unit||'UND',cost:data.cost||ZERO,price:data.price||ZERO,minStock:data.minStock||ZERO,taxRate:data.taxRate||new Prisma.Decimal(16),barcode:data.barcode||null};
    const record=row.action==='update'?await tx.product.update({where:{tenantId_sku:{tenantId,sku:data.sku}},data:master}):await tx.product.create({data:{tenantId,sku:data.sku,...master,stock:ZERO,reserved:ZERO}});return {status:row.action==='update'?'updated':'created',entityId:record.id};
  }
  if(type==='accounts'){
    if(data.parentCode){const parent=await tx.chartAccount.findFirst({where:{tenantId,code:data.parentCode,active:true}});if(!parent)throw new HttpError(422,`La cuenta padre ${data.parentCode} no existe al aplicar el batch.`,{code:'IMPORT_PARENT_NOT_FOUND'});}
    const accountData={name:data.name,type:data.type,nature:data.nature,level:data.level,parentCode:data.parentCode||null,allowPosting:data.allowPosting,description:data.description||null,active:true};
    const record=row.action==='update'?await tx.chartAccount.update({where:{tenantId_code:{tenantId,code:data.code}},data:accountData}):await tx.chartAccount.create({data:{tenantId,code:data.code,...accountData}});return {status:row.action==='update'?'updated':'created',entityId:record.id};
  }
  const employeeData={fullName:data.fullName,position:data.position,department:data.department||null,hiredAt:data.hiredAt?new Date(data.hiredAt):null,salary:data.salary||ZERO,active:true};
  const record=row.action==='update'?await tx.employee.update({where:{tenantId_idNumber:{tenantId,idNumber:data.idNumber}},data:employeeData}):await tx.employee.create({data:{tenantId,idNumber:data.idNumber,...employeeData}});return {status:row.action==='update'?'updated':'created',entityId:record.id};
}

router.get('/', asyncHandler(async(req,res)=>{
  const ctx=context(req);const rows=await prisma.importBatch.findMany({where:{tenantId:ctx.tenantId},orderBy:{createdAt:'desc'},take:50});ok(res,rows.map(publicBatch));
}));

router.post('/preview', validateBody(previewSchema), asyncHandler(async(req,res)=>{
  const ctx=context(req);const input=req.body as z.infer<typeof previewSchema>;
  const serializedSize=Buffer.byteLength(JSON.stringify(input.rows),'utf8');
  if(serializedSize>5_000_000)throw new HttpError(413,'El contenido supera el límite de 5 MB para staging.',{code:'IMPORT_PAYLOAD_TOO_LARGE'});
  const rows=await stageRows(input.type,ctx.tenantId,input.rows,input.duplicatePolicy);
  const digest=checksum(input.type,input.templateVersion,rows.map((row)=>({key:row.key,action:row.action,normalized:row.normalized,errors:row.errors})));
  const accepted=rows.filter((row)=>row.action!=='error').length;const rejected=rows.length-accepted;
  const payload:BatchPayload={version:1,templateVersion:input.templateVersion,checksum:digest,duplicatePolicy:input.duplicatePolicy,filename:sanitizedFilename(input.filename),createdBy:ctx.userId||null,rows,counts:{total:rows.length,valid:accepted,invalid:rejected,created:0,updated:0,skipped:rows.filter((r)=>r.action==='skip').length}};
  const batch=await prisma.importBatch.create({data:{tenantId:ctx.tenantId,userId:ctx.userId||null,type:input.type,filename:sanitizedFilename(input.filename),accepted,rejected,status:rejected?'invalid':'validated',payload:payload as any}});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'import.dry-run',entity:'ImportBatch',entityId:batch.id,after:{type:input.type,status:batch.status,checksum:digest,counts:payload.counts,duplicatePolicy:input.duplicatePolicy},ipAddress:ctx.ip,userAgent:ctx.userAgent});
  ok(res,publicBatch(batch));
}));

router.get('/:id', asyncHandler(async(req,res)=>{
  const ctx=context(req);const batch=await prisma.importBatch.findFirst({where:{id:req.params.id,tenantId:ctx.tenantId}});if(!batch)throw new HttpError(404,'Batch de importación no encontrado.',{code:'IMPORT_BATCH_NOT_FOUND'});ok(res,publicBatch(batch));
}));

router.post('/:id/commit', validateBody(commitSchema), asyncHandler(async(req,res)=>{
  const ctx=context(req);const input=req.body as z.infer<typeof commitSchema>;
  const execution=await runFinancialIdempotentMutation({tenantId:ctx.tenantId,scope:`imports.commit.${req.params.id}`,key:idempotencyKey(req),request:{batchId:req.params.id,checksum:input.checksum},requestId:requestId(req),replay:async(tx,record)=>{const batch=await tx.importBatch.findFirst({where:{id:record.resourceId||req.params.id,tenantId:ctx.tenantId}});if(!batch)throw new HttpError(409,'El resultado del commit ya no puede reconstruirse.',{code:'IDEMPOTENCY_RESULT_UNAVAILABLE'});return publicBatch(batch);}},async(tx)=>{
    const locked=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "ImportBatch" WHERE "id"=${req.params.id} AND "tenantId"=${ctx.tenantId} FOR UPDATE`);if(!locked.length)throw new HttpError(404,'Batch de importación no encontrado.',{code:'IMPORT_BATCH_NOT_FOUND'});
    const batch=await tx.importBatch.findUniqueOrThrow({where:{id:req.params.id}});ensureFresh(batch);const payload=payloadOf(batch);
    if(payload.checksum!==input.checksum)throw new HttpError(409,'El checksum no coincide con el dry-run confirmado.',{code:'IMPORT_CHECKSUM_MISMATCH'});
    if(batch.status==='completed')return {data:publicBatch(batch),resourceType:'ImportBatch',resourceId:batch.id};
    if(batch.status!=='validated'||batch.rejected>0||!payload.rows)throw new HttpError(409,'Sólo se puede confirmar un batch validado sin filas rechazadas.',{code:'IMPORT_BATCH_NOT_VALIDATED',status:batch.status,rejected:batch.rejected});
    await tx.importBatch.update({where:{id:batch.id},data:{status:'committing'}});
    const report:Array<{index:number;key:string;action:RowAction;status:string;errors:string[];entityId?:string}>=[];let created=0,updated=0,skipped=0;
    for(const row of payload.rows){const result=await applyRow(tx,batch.type as ImportType,ctx.tenantId,row);if(result.status==='created')created++;else if(result.status==='updated')updated++;else skipped++;report.push({index:row.index,key:row.key,action:row.action,status:result.status,errors:[],entityId:result.entityId});}
    const finalPayload:BatchPayload={...payload,rows:undefined,report,counts:{...payload.counts,created,updated,skipped},completedAt:new Date().toISOString()};
    const completed=await tx.importBatch.update({where:{id:batch.id},data:{status:'completed',payload:finalPayload as any}});
    return {data:publicBatch(completed),resourceType:'ImportBatch',resourceId:batch.id};
  });
  res.setHeader('Idempotency-Replayed',execution.replayed?'true':'false');
  if(!execution.replayed){const data=execution.data as any;await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'import.commit',entity:'ImportBatch',entityId:data.id,after:{type:data.type,status:data.status,checksum:data.checksum,counts:data.counts},ipAddress:ctx.ip,userAgent:ctx.userAgent});}
  ok(res,execution.data,execution.responseCode);
}));

const csvCell=(value:unknown)=>{let text=String(value??'');if(/^[=+\-@]/.test(text))text=`'${text}`;return `"${text.replace(/"/g,'""')}"`;};
router.get('/:id/report', asyncHandler(async(req,res)=>{
  const ctx=context(req);const batch=await prisma.importBatch.findFirst({where:{id:req.params.id,tenantId:ctx.tenantId}});if(!batch)throw new HttpError(404,'Batch de importación no encontrado.',{code:'IMPORT_BATCH_NOT_FOUND'});const payload=payloadOf(batch);const report=payload.report||(payload.rows||[]).map((row)=>({index:row.index,key:row.key,action:row.action,status:row.action==='error'?'invalid':'validated',errors:row.errors.map((e)=>`${e.code}: ${e.message}`)}));
  const csv=['row,key,action,status,errors',...report.map((row)=>[row.index,row.key,row.action,row.status,(row.errors||[]).join(' | ')].map(csvCell).join(','))].join('\n');ok(res,{filename:`import-${batch.type}-${batch.id}.csv`,csv,status:batch.status,checksum:payload.checksum});
}));

export default router;