import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { assertBalanced, assertPeriodOpen, salesInvoiceLinesForLedger } from '../accounting/accounting.service.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { runFinancialIdempotentMutation } from '../../shared/services/financial-idempotency.service.js';

const router = Router();
router.use(requireTenant);

const lineSchema = z.object({ productId: z.string().optional(), description: z.string().min(2), quantity: z.coerce.number().positive(), unitPrice: z.coerce.number().nonnegative(), taxRate: z.coerce.number().default(16) });
const saleSchema = z.object({ clientId: z.string().optional(), number: z.string().min(1), controlNo: z.string().optional(), issueDate: z.coerce.date().optional(), fiscalPeriod: z.string().min(6), currency: z.string().default('VES'), exchangeRate: z.coerce.number().default(1), status: z.enum(['draft','issued','paid','overdue']).default('issued'), notes: z.string().optional(), lines: z.array(lineSchema).min(1) });
const cancellationSchema=z.object({reason:z.string().trim().min(3).max(500).optional()});
const context=(req:any)=>req.context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
const requestId=(req:any)=>String(req.requestId||'')||null;
const idempotencyKey=(req:any)=>req.header('Idempotency-Key')||null;

router.get('/', requirePermission('sales.view'), asyncHandler(async (req, res) => {
  const tenantId = context(req).tenantId;
  const data = await prisma.salesInvoice.findMany({ where: { tenantId }, include: { client: true, lines: true }, orderBy: { issueDate: 'desc' }, take: 100 });
  ok(res, data);
}));

router.post('/', requirePermission('sales.manage'), validateBody(saleSchema), asyncHandler(async (req, res) => {
  const ctx=context(req);
  const lines=req.body.lines.map((line:any)=>({...line,total:Number(line.quantity)*Number(line.unitPrice)}));
  const subtotal=lines.reduce((sum:number,line:any)=>sum+line.total,0);
  const iva=lines.reduce((sum:number,line:any)=>sum+(line.total*Number(line.taxRate||0)/100),0);
  const total=subtotal+iva;

  const execution=await runFinancialIdempotentMutation({
    tenantId:ctx.tenantId,
    scope:'sales.create',
    key:idempotencyKey(req),
    request:req.body,
    requestId:requestId(req),
    replay:async(tx,record)=>{
      if(!record.resourceId)throw new HttpError(409,'El resultado original de la venta no tiene recurso asociado.',{code:'IDEMPOTENCY_RESULT_UNAVAILABLE',scope:'sales.create'});
      const sale=await tx.salesInvoice.findFirst({where:{id:record.resourceId,tenantId:ctx.tenantId},include:{lines:true}});
      if(!sale)throw new HttpError(409,'La venta original ya no puede reconstruirse.',{code:'IDEMPOTENCY_RESULT_UNAVAILABLE',scope:'sales.create'});
      const ledger=await tx.ledgerEntry.findFirst({where:{tenantId:ctx.tenantId,source:'sales',sourceId:sale.id},select:{id:true}});
      return{...sale,ledgerEntryId:ledger?.id||null};
    }
  },async(tx)=>{
    if(req.body.status!=='draft')await assertPeriodOpen(ctx.tenantId,req.body.fiscalPeriod,tx);
    const sale=await tx.salesInvoice.create({
      data:{tenantId:ctx.tenantId,clientId:req.body.clientId,number:req.body.number,controlNo:req.body.controlNo,issueDate:req.body.issueDate,fiscalPeriod:req.body.fiscalPeriod,currency:req.body.currency,exchangeRate:req.body.exchangeRate,subtotal,iva,total,status:req.body.status,notes:req.body.notes,lines:{create:lines}},
      include:{lines:true}
    });
    let ledgerEntryId:string|null=null;
    if(sale.status!=='draft'){
      const ledgerLines=salesInvoiceLinesForLedger(sale);
      assertBalanced(ledgerLines);
      const ledger=await tx.ledgerEntry.create({
        data:{tenantId:ctx.tenantId,fiscalPeriod:sale.fiscalPeriod,description:`Venta ${sale.number}`,source:'sales',sourceId:sale.id,salesInvoiceId:sale.id,lines:{create:ledgerLines.map((line)=>({accountCode:line.accountCode,accountName:line.accountName,debit:Number(line.debit||0),credit:Number(line.credit||0),currency:sale.currency||'VES',exchangeRate:Number(sale.exchangeRate||1)}))}}
      });
      ledgerEntryId=ledger.id;
    }
    return{data:{...sale,ledgerEntryId},resourceType:'SalesInvoice',resourceId:sale.id};
  });

  res.setHeader('Idempotency-Replayed',execution.replayed?'true':'false');
  if(execution.replayed){
    await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'idempotency.replay',entity:'salesInvoice',entityId:(execution.data as any).id,after:{scope:'sales.create',recordId:execution.recordId,originalRequestId:execution.originalRequestId,requestId:requestId(req)},ipAddress:ctx.ip,userAgent:ctx.userAgent});
  }else{
    await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'create',entity:'salesInvoice',entityId:(execution.data as any).id,after:execution.data,ipAddress:ctx.ip,userAgent:ctx.userAgent});
  }
  ok(res,execution.data,execution.responseCode);
}));

router.patch('/:id/cancel',requirePermission('sales.manage'),validateBody(cancellationSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req);
  const saleId=req.params.id;
  const scope='sales.cancel';
  let beforeSale:any=null;

  const execution=await runFinancialIdempotentMutation({
    tenantId:ctx.tenantId,
    scope,
    key:idempotencyKey(req),
    request:{saleId,...req.body},
    requestId:requestId(req),
    replay:async(tx,record)=>{
      const resourceId=record.resourceId||saleId;
      const sale=await tx.salesInvoice.findFirst({where:{id:resourceId,tenantId:ctx.tenantId},include:{lines:true}});
      if(!sale)throw new HttpError(409,'La anulación original ya no puede reconstruirse.',{code:'IDEMPOTENCY_RESULT_UNAVAILABLE',scope});
      const reversal=await tx.ledgerEntry.findFirst({where:{tenantId:ctx.tenantId,source:'manual',sourceId:`sales-cancel:${sale.id}`}});
      return{sale,reversalId:reversal?.id||null,alreadyCancelled:true};
    }
  },async(tx)=>{
    const lockKey=`${scope}:${ctx.tenantId}:${saleId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const sale=await tx.salesInvoice.findFirst({where:{id:saleId,tenantId:ctx.tenantId},include:{lines:true}});
    if(!sale)throw new HttpError(404,'Venta no encontrada.');
    beforeSale=sale;
    if(sale.status==='draft')throw new HttpError(409,'Los borradores se eliminan; no se anulan.');

    const reversalSourceId=`sales-cancel:${sale.id}`;
    if(sale.status==='cancelled'){
      const reversal=await tx.ledgerEntry.findFirst({where:{tenantId:ctx.tenantId,source:'manual',sourceId:reversalSourceId}});
      return{data:{sale,reversalId:reversal?.id||null,alreadyCancelled:true},resourceType:'SalesInvoice',resourceId:sale.id};
    }

    await assertPeriodOpen(ctx.tenantId,sale.fiscalPeriod,tx);
    const originals=await tx.ledgerEntry.findMany({where:{tenantId:ctx.tenantId,OR:[{salesInvoiceId:sale.id},{source:'sales',sourceId:sale.id}]},include:{lines:true}});
    let reversal=await tx.ledgerEntry.findFirst({where:{tenantId:ctx.tenantId,source:'manual',sourceId:reversalSourceId}});
    const originalLines=originals.flatMap((entry)=>entry.lines);
    if(!reversal&&originalLines.length){
      reversal=await tx.ledgerEntry.create({data:{tenantId:ctx.tenantId,fiscalPeriod:sale.fiscalPeriod,description:`Reverso por anulación de venta ${sale.number}`,source:'manual',sourceId:reversalSourceId,salesInvoiceId:sale.id,posted:originals.some((entry)=>entry.posted),lines:{create:originalLines.map((line)=>({accountCode:line.accountCode,accountName:line.accountName,debit:Number(line.credit||0),credit:Number(line.debit||0),currency:line.currency,exchangeRate:Number(line.exchangeRate||1)}))}}});
    }
    const cancelled=await tx.salesInvoice.update({where:{id:sale.id},data:{status:'cancelled'},include:{lines:true}});
    return{data:{sale:cancelled,reversalId:reversal?.id||null,reversedEntries:originals.map((entry)=>entry.id),accountingWarning:originalLines.length?null:'La venta no tenía asiento contable asociado.',alreadyCancelled:false},resourceType:'SalesInvoice',resourceId:sale.id};
  });

  res.setHeader('Idempotency-Replayed',execution.replayed?'true':'false');
  if(execution.replayed){
    await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'idempotency.replay',entity:'salesInvoice',entityId:saleId,after:{scope,recordId:execution.recordId,originalRequestId:execution.originalRequestId,requestId:requestId(req)},ipAddress:ctx.ip,userAgent:ctx.userAgent});
  }else{
    await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'cancel',entity:'salesInvoice',entityId:saleId,before:beforeSale,after:{...execution.data,reason:req.body.reason||'Anulación solicitada desde Ventas'},ipAddress:ctx.ip,userAgent:ctx.userAgent});
  }
  ok(res,execution.data,execution.responseCode);
}));

router.delete('/:id',requirePermission('sales.manage'),asyncHandler(async(req,res)=>{
  const ctx=context(req);
  const sale=await prisma.salesInvoice.findFirst({where:{id:req.params.id,tenantId:ctx.tenantId},include:{lines:true}});
  if(!sale)throw new HttpError(404,'Venta no encontrada.');
  if(sale.status!=='draft')throw new HttpError(409,'Solo se eliminan ventas en borrador. Las ventas emitidas deben anularse.');
  await prisma.salesInvoice.delete({where:{id:sale.id}});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'delete-draft',entity:'salesInvoice',entityId:sale.id,before:sale,ipAddress:ctx.ip,userAgent:ctx.userAgent});
  ok(res,{deleted:true,id:sale.id});
}));

export default router;
