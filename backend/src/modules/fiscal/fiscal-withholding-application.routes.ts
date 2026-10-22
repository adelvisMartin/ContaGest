import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { HttpError, asyncHandler, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { normalizeIdempotencyKey, runFinancialIdempotentMutation } from '../../shared/services/financial-idempotency.service.js';
import { assertBalanced, assertPeriodOpen, inverseLedgerLines } from '../accounting/accounting.service.js';
import { resolveSemanticPostingAccounts } from '../chart-accounts/account-role.repository.js';
import { getFxPolicy } from '../currency/fx.repository.js';
import { fiscalEvidenceHash, resolveFiscalRules } from './fiscal.repository.js';
import { getEffectiveTaxpayerProfile } from './taxpayer-profile.repository.js';
import { exactMinor, planPostedPurchaseWithholding } from './ve-iva-withholding-application.js';
import type { AppliedRatio } from './ve-tax-posting-plan.js';

const router=Router();
const applicationSchema=z.object({
  purchaseInvoiceId:z.string().uuid(),
  ivaRuleKey:z.string().regex(/^iva[.:][a-z0-9._:-]{1,60}$/i),
  retentionRuleKey:z.string().regex(/^ret_iva[.:][a-z0-9._:-]{1,60}$/i)
}).strict();
const reversalSchema=z.object({
  fiscalPeriod:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
  reason:z.string().trim().min(15).max(500)
}).strict();

type Context={tenantId:string;userId?:string;ip?:string;userAgent?:string;requestId?:string};
const context=(req:Request)=>(req as Request & {context:Context}).context;
const actor=(ctx:Context)=>{
  if(!ctx.userId)throw new HttpError(401,'La retención requiere identidad del operador.');
  return ctx.userId;
};
const idem=(req:Request)=>{
  const key=normalizeIdempotencyKey(req.header('Idempotency-Key'));
  if(!key)throw new HttpError(400,'Idempotency-Key es obligatorio para aplicaciones y reversos fiscales.',{code:'FISCAL_IDEMPOTENCY_REQUIRED'});
  return key;
};
const assertPeriods=async(tx:Prisma.TransactionClient,tenantId:string,period:string)=>{
  await assertPeriodOpen(tenantId,period,tx);
  const closed=await tx.closingPeriod.findFirst({where:{
    tenantId,period,status:'closed',module:{in:['fiscal','iva','retiva']}
  },select:{module:true}});
  if(closed)throw new HttpError(409,'El período fiscal de retención está cerrado.',{code:'FISCAL_RETENTION_PERIOD_CLOSED',module:closed.module});
};
type ApplicationRow={
  id:string;tenantId:string;purchaseInvoiceId:string;sourceLedgerEntryId:string;
  ledgerEntryId:string;kind:string;recognizedAt:Date;period:string;taxableMinor:bigint;
  vatMinor:bigint;withheldMinor:bigint;evidence:unknown;evidenceSha256:string;
  status:'POSTED'|'REVERSED';reversalLedgerEntryId:string|null;
};
function verifyApplication(row:ApplicationRow,tenantId:string){
  if(!row||row.tenantId!==tenantId||fiscalEvidenceHash(row.evidence)!==row.evidenceSha256)
    throw new HttpError(409,'El historial de retención no conserva evidencia íntegra.',{code:'FISCAL_WITHHOLDING_EVIDENCE_INTEGRITY'});
  return row;
}
const asMoney=(minor:number)=>{
  const n=BigInt(minor);
  return (n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0');
};
const bad=(message:string,code:string)=>new HttpError(422,message,{code});

router.get('/',requirePermission('fiscal.read'),asyncHandler(async(req,res)=>{
  const ctx=context(req);
  const rows=await prisma.$queryRaw<ApplicationRow[]>(Prisma.sql`
    SELECT * FROM public."FiscalWithholdingApplication"
    WHERE "tenantId"=${ctx.tenantId} ORDER BY "createdAt" DESC LIMIT 100
  `);
  ok(res,rows.map(row=>verifyApplication(row,ctx.tenantId)));
}));
router.get('/:id',requirePermission('fiscal.read'),asyncHandler(async(req,res)=>{
  const ctx=context(req),id=z.string().uuid().parse(req.params.id);
  const rows=await prisma.$queryRaw<ApplicationRow[]>(Prisma.sql`
    SELECT * FROM public."FiscalWithholdingApplication"
    WHERE "tenantId"=${ctx.tenantId} AND "id"=${id}::uuid
  `);
  if(rows.length!==1)throw new HttpError(404,'Aplicación no encontrada.');
  ok(res,verifyApplication(rows[0],ctx.tenantId));
}));

/** AP recognized posting -> withholding payable. Does NOT issue a statutory voucher. */
router.post('/',requirePermission('fiscal.manage_documents'),validateBody(applicationSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req),userId=actor(ctx),key=idem(req);
  const input=req.body as z.infer<typeof applicationSchema>;
  const result=await runFinancialIdempotentMutation({
    tenantId:ctx.tenantId,scope:'fiscal.retiva.apply',key,request:input,
    requestId:ctx.requestId||null,
  },async tx=>{
    // A second key cannot create another withholding against the same invoice.
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM public."PurchaseInvoice"
      WHERE "id"=${input.purchaseInvoiceId} AND "tenantId"=${ctx.tenantId} FOR UPDATE
    `);
    const invoice=await tx.purchaseInvoice.findFirst({
      where:{id:input.purchaseInvoiceId,tenantId:ctx.tenantId},
      include:{supplier:true}
    });
    if(!invoice||!invoice.supplier||!invoice.supplier.active)
      throw bad('Compra y proveedor activo del tenant son obligatorios.','RETIVA_SOURCE_PURCHASE_NOT_READY');
    const already=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM public."FiscalWithholdingApplication"
      WHERE "tenantId"=${ctx.tenantId} AND "purchaseInvoiceId"=${invoice.id} AND "kind"='RET_IVA'
    `);
    if(already.length)throw new HttpError(409,'La compra ya tiene una aplicación IVA: no se duplica con otra clave.',{code:'RETIVA_DUPLICATE_PURCHASE'});

    const original=await tx.ledgerEntry.findMany({where:{
      tenantId:ctx.tenantId,source:'purchase',sourceId:invoice.id,
      posted:true,reversalOfId:null
    },include:{lines:true,reversedBy:true}});
    if(original.length!==1||!original[0].postedAt||original[0].reversedBy)
      throw bad('La compra necesita exactamente un asiento original contabilizado, no reversado.','RETIVA_ORIGIN_LEDGER_NOT_READY');
    const posted=original[0];
    if(invoice.issueDate>posted.postedAt)
      throw bad('No hay abono contable válido posterior a la fecha de la compra.','RETIVA_RECOGNITION_DATE_INVALID');
    const recognizedAt=posted.postedAt;
    const period=recognizedAt.toISOString().slice(0,7);
    await assertPeriods(tx,ctx.tenantId,period);
    const fx=await getFxPolicy(ctx.tenantId,tx);
    if(fx.functionalCurrency!=='VES'||invoice.currency!=='VES'||!invoice.total||!invoice.exchangeRate.eq(1))
      throw bad('Aplicación IVA interna admitida sólo para libros y facturas VES con FX=1.','RETIVA_CURRENCY_UNSUPPORTED');

    const [buyer,vatAtInvoice,retAtRecognition]=await Promise.all([
      getEffectiveTaxpayerProfile(tx,ctx.tenantId,recognizedAt),
      resolveFiscalRules(tx,{tenantId:ctx.tenantId,ruleKeys:[input.ivaRuleKey],effectiveAt:invoice.issueDate}),
      resolveFiscalRules(tx,{tenantId:ctx.tenantId,ruleKeys:[input.retentionRuleKey],effectiveAt:recognizedAt}),
    ]);
    const rule=(r:(typeof vatAtInvoice)[number]):AppliedRatio=>{
      if(!r.legalSourceId||!r.legalSourceSha256)
        throw bad('Regla sin provenance fiscal verificada.','RETIVA_LEGAL_RULE_MISSING');
      return {ruleId:r.id,ruleKey:r.ruleKey,ruleHash:r.hash,legalSourceId:r.legalSourceId,
        legalSourceSha256:r.legalSourceSha256,definition:r.definition as AppliedRatio['definition']};
    };
    const roles=await resolveSemanticPostingAccounts(tx,ctx.tenantId,['ap','vat_input','withholding_payable']);
    const originalAP=posted.lines.filter(l=>l.accountCode===roles.ap.accountCode);
    const originalVAT=posted.lines.filter(l=>l.accountCode===roles.vat_input.accountCode);
    if(originalAP.length!==1||!originalAP[0].credit.eq(invoice.total)||
       originalVAT.length!==1||!originalVAT[0].debit.eq(invoice.iva))
      throw bad('El asiento original y las cuentas AP/IVA no concilian con la factura.','RETIVA_SOURCE_RECONCILIATION_FAILED');

    const taxableMinor=exactMinor(invoice.subtotal.toFixed(2)),
      invoiceVatMinor=exactMinor(invoice.iva.toFixed(2)),
      totalMinor=exactMinor(invoice.total.toFixed(2));
    let plan:ReturnType<typeof planPostedPurchaseWithholding>;
    try{
      plan=planPostedPurchaseWithholding({
        tenantId:ctx.tenantId,invoiceTenantId:invoice.tenantId,supplierTenantId:invoice.supplier.tenantId,
        sourceLedgerTenantId:posted.tenantId,invoiceStatus:invoice.status,
        supplierRetentionProfile:invoice.supplier.retentionProfile||'',
        taxpayerCategory:buyer.taxpayerCategory,
        originalLedgerPosted:posted.posted,currency:invoice.currency,
        functionalCurrency:fx.functionalCurrency,exchangeRate:'1',
        issuedAt:invoice.issueDate,recognizedAt,period,taxableMinor,
        invoiceVatMinor,invoiceTotalMinor:totalMinor,
        iva:rule(vatAtInvoice[0]),retention:rule(retAtRecognition[0])
      });
    }catch{
      throw bad('La factura, tasa IVA y retención efectiva no concilian; se requieren documentos y perfiles revisados.', 'RETIVA_INVOICE_RULE_MISMATCH');
    }
    const applicationId=randomUUID();
    const lines=[
      {accountCode:roles.ap.accountCode,accountName:roles.ap.name,
        debit:asMoney(plan.withheldMinor),credit:'0.00',currency:'VES'},
      {accountCode:roles.withholding_payable.accountCode,accountName:roles.withholding_payable.name,
        debit:'0.00',credit:asMoney(plan.withheldMinor),currency:'VES'}
    ];
    assertBalanced(lines);
    const draft=await tx.ledgerEntry.create({data:{
      tenantId:ctx.tenantId,fiscalPeriod:period,description:`Aplicación interna RET IVA compra ${invoice.number}`,
      source:'tax',sourceId:applicationId,posted:false,postedAt:null,postedBy:null,reversalOfId:null,
      lines:{create:lines}
    }});
    const newEntry=await tx.ledgerEntry.update({where:{id:draft.id},data:{
      posted:true,postedAt:new Date(),postedBy:userId
    }});
    const evidence={
      kind:'RET_IVA',mode:'INTERNAL_AP_APPLICATION_NOT_CERTIFICATE',
      tenantId:ctx.tenantId,purchaseInvoiceId:invoice.id,invoiceNumber:invoice.number,
      invoiceControlNo:invoice.controlNo,invoiceIssueDate:invoice.issueDate.toISOString(),
      supplierId:invoice.supplier.id,supplierRif:invoice.supplier.rif,supplierName:invoice.supplier.name,
      buyerProfileId:buyer.id,buyerProfileVersion:buyer.version,buyerRif:buyer.rifSnapshot,
      buyerCategory:buyer.taxpayerCategory,buyerLegalSourceSha256:buyer.sourceContentSha256,
      sourceLedgerEntryId:posted.id,recognizedAt:recognizedAt.toISOString(),
      period,vatRuleId:vatAtInvoice[0].id,vatRuleHash:vatAtInvoice[0].hash,
      vatSourceSha256:vatAtInvoice[0].legalSourceSha256,
      retentionRuleId:retAtRecognition[0].id,retentionRuleHash:retAtRecognition[0].hash,
      retentionSourceSha256:retAtRecognition[0].legalSourceSha256,
      taxableMinor,vatMinor:plan.vatMinor,withheldMinor:plan.withheldMinor,
      ledgerEntryId:newEntry.id,accounts:lines.map(l=>l.accountCode)
    };
    const evidenceSha256=fiscalEvidenceHash(evidence);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO public."FiscalWithholdingApplication" (
        "id","tenantId","purchaseInvoiceId","sourceLedgerEntryId","ledgerEntryId",
        "kind","recognizedAt","period","taxableMinor","vatMinor","withheldMinor",
        "evidence","evidenceSha256","createdBy"
      ) VALUES (
        ${applicationId}::uuid,${ctx.tenantId},${invoice.id},${posted.id},${newEntry.id},
        'RET_IVA',${recognizedAt},${period},${plan.taxableMinor},${plan.vatMinor},
        ${plan.withheldMinor},${JSON.stringify(evidence)}::jsonb,${evidenceSha256},${userId}
      )
    `);
    await tx.auditLog.create({data:{
      tenantId:ctx.tenantId,userId,action:'fiscal.retiva.applied',
      entity:'FiscalWithholdingApplication',entityId:applicationId,
      after:{invoiceId:invoice.id,ledgerEntryId:newEntry.id,amountMinor:plan.withheldMinor,
        evidenceSha256,mode:'INTERNAL_NOT_CERTIFICATE',requestId:ctx.requestId},
      ipAddress:ctx.ip||null,userAgent:ctx.userAgent||null
    }});
    return {data:{id:applicationId,status:'POSTED',period,ledgerEntryId:newEntry.id,
      withheldMinor:plan.withheldMinor,evidenceSha256,
      mode:'INTERNAL_AP_APPLICATION_NOT_CERTIFICATE'},responseCode:201,
      resourceType:'FiscalWithholdingApplication',resourceId:applicationId};
  });
  res.status(result.responseCode).json({ok:true,data:result.data,meta:{replayed:result.replayed}});
}));

router.post('/:id/reverse',requirePermission('fiscal.manage_documents'),
  validateBody(reversalSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req),userId=actor(ctx),key=idem(req);
  const id=z.string().uuid().parse(req.params.id);
  const input=req.body as z.infer<typeof reversalSchema>;
  const result=await runFinancialIdempotentMutation({
    tenantId:ctx.tenantId,scope:'fiscal.retiva.reverse',key,
    request:{id,...input},requestId:ctx.requestId||null,
  },async tx=>{
    const records=await tx.$queryRaw<ApplicationRow[]>(Prisma.sql`
      SELECT * FROM public."FiscalWithholdingApplication"
      WHERE "tenantId"=${ctx.tenantId} AND "id"=${id}::uuid FOR UPDATE
    `);
    if(records.length!==1)throw new HttpError(404,'Retención interna no encontrada.');
    const application=verifyApplication(records[0],ctx.tenantId);
    if(application.status!=='POSTED')
      throw new HttpError(409,'La retención ya tiene un reverso y no puede reversarse dos veces.',{code:'RETIVA_ALREADY_REVERSED'});
    await assertPeriods(tx,ctx.tenantId,input.fiscalPeriod);
    const original=await tx.ledgerEntry.findFirst({where:{
      id:application.ledgerEntryId,tenantId:ctx.tenantId,source:'tax',
      sourceId:application.id,posted:true
    },include:{lines:true,reversedBy:true}});
    if(!original||original.reversedBy||original.reversalOfId)
      throw new HttpError(409,'El asiento de retención no puede reversarse.',{code:'RETIVA_LEDGER_ALREADY_REVERSED'});
    const inverted=inverseLedgerLines(original.lines);
    assertBalanced(inverted);
    const draft=await tx.ledgerEntry.create({data:{
      tenantId:ctx.tenantId,fiscalPeriod:input.fiscalPeriod,
      description:`Reverso aplicación RET IVA compra ${application.purchaseInvoiceId}`,
      source:'tax',sourceId:`retiva-reverse:${application.id}`,
      posted:false,reversalOfId:null,
      lines:{create:inverted.map(l=>({accountCode:l.accountCode,accountName:l.accountName,
        debit:l.debit,credit:l.credit,currency:l.currency,exchangeRate:l.exchangeRate}))}
    }});
    const posted=await tx.ledgerEntry.update({where:{id:draft.id},data:{
      posted:true,postedAt:new Date(),postedBy:userId,reversalOfId:original.id
    }});
    await tx.$executeRaw(Prisma.sql`
      UPDATE public."FiscalWithholdingApplication"
      SET "status"='REVERSED',"reversalLedgerEntryId"=${posted.id},
        "reversedBy"=${userId},"reversedAt"=now(),"reversalReason"=${input.reason}
      WHERE "tenantId"=${ctx.tenantId} AND "id"=${application.id}::uuid
        AND "status"='POSTED'
    `);
    await tx.auditLog.create({data:{
      tenantId:ctx.tenantId,userId,action:'fiscal.retiva.reversed',
      entity:'FiscalWithholdingApplication',entityId:application.id,
      before:{status:'POSTED',ledgerEntryId:original.id,evidenceSha256:application.evidenceSha256},
      after:{status:'REVERSED',reversalLedgerEntryId:posted.id,reason:input.reason},
      ipAddress:ctx.ip||null,userAgent:ctx.userAgent||null
    }});
    return {data:{id:application.id,status:'REVERSED',reversalLedgerEntryId:posted.id,
      evidenceSha256:application.evidenceSha256},
      resourceType:'FiscalWithholdingApplication',resourceId:application.id};
  });
  ok(res,{...result.data,replayed:result.replayed});
}));
export default router;
