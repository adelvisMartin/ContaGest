import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { calculateInvoiceTotals } from '../../shared/financial/invoice.js';
import { money, serializeDecimal, ZERO } from '../../shared/financial/decimal.js';
import { approvalPolicyApplies, claimApproval, finishApprovalClaim, getActiveApprovalPolicy, releaseApprovalClaim, type ApprovalCapability } from './approvals.service.js';

type BuildInput={tenantId:string;method:string;path:string;body:any};
export type ApprovalExecutionContext={capability:ApprovalCapability;payload:Record<string,unknown>;amount:string|null;currency:string|null};

const normalizePath=(value:string)=>String(value||'').split('?')[0].replace(/\/+$/,'')||'/';
const decimalString=(value:any,scale=2)=>serializeDecimal(value??ZERO,scale);

export async function buildApprovalExecutionContext(input:BuildInput):Promise<ApprovalExecutionContext|null>{
  const method=String(input.method||'GET').toUpperCase();const path=normalizePath(input.path);const body=input.body||{};
  if(method==='POST'&&path==='/purchases'&&String(body.status||'issued')!=='draft'){
    const totals=calculateInvoiceTotals((body.lines||[]).map((line:any)=>({quantity:line.quantity,unitAmount:line.unitCost,taxRate:line.taxRate??16})));
    return {capability:'purchases.issue',payload:{supplierId:body.supplierId||null,number:body.number,controlNo:body.controlNo||null,fiscalPeriod:body.fiscalPeriod,status:body.status||'issued',lines:body.lines||[],total:decimalString(totals.total)},amount:decimalString(totals.total),currency:String(body.currency||'VES')};
  }
  const purchaseCancel=path.match(/^\/purchases\/([^/]+)\/cancel$/);
  if(method==='PATCH'&&purchaseCancel){const purchase=await prisma.purchaseInvoice.findFirst({where:{id:purchaseCancel[1],tenantId:input.tenantId},select:{id:true,number:true,total:true,status:true,fiscalPeriod:true}});if(!purchase)throw new HttpError(404,'Compra no encontrada para preparar aprobación.');return {capability:'purchases.cancel',payload:{purchaseId:purchase.id,number:purchase.number,currentStatus:purchase.status,fiscalPeriod:purchase.fiscalPeriod,reason:body.reason||null,reversalFiscalPeriod:body.reversalFiscalPeriod||purchase.fiscalPeriod,reversalDate:body.reversalDate||null,total:decimalString(purchase.total)},amount:decimalString(purchase.total),currency:'VES'};}
  if(method==='POST'&&path==='/banking/movements'&&body.type==='expense')return {capability:'banking.payment',payload:{accountId:body.accountId,date:body.date||null,description:body.description,reference:body.reference||null,type:'expense',amount:decimalString(body.amount),currency:body.currency||null},amount:decimalString(body.amount),currency:body.currency||null};
  const bankReverse=path.match(/^\/banking\/movements\/([^/]+)\/reverse$/);
  if(method==='POST'&&bankReverse){const movement=await prisma.bankMovement.findFirst({where:{id:bankReverse[1],tenantId:input.tenantId},include:{account:true}});if(!movement)throw new HttpError(404,'Movimiento bancario no encontrado para preparar aprobación.');const amount=money(movement.credit).gt(0)?movement.credit:movement.debit;return {capability:'banking.reverse',payload:{movementId:movement.id,accountId:movement.accountId,amount:decimalString(amount),currency:movement.account.currency,reason:body.reason,date:body.date||null},amount:decimalString(amount),currency:movement.account.currency};}
  const bankCorrect=path.match(/^\/banking\/movements\/([^/]+)\/correct$/);
  if(method==='POST'&&bankCorrect)return {capability:'banking.correct',payload:{movementId:bankCorrect[1],reason:body.reason,date:body.date||null,description:body.description,reference:body.reference||null,type:body.type,amount:decimalString(body.amount)},amount:decimalString(body.amount),currency:null};
  if(method==='POST'&&path==='/inventory/adjustments')return {capability:'inventory.adjust',payload:{productId:body.productId,targetStock:decimalString(body.targetStock,3),reasonCode:body.reasonCode,note:body.note},amount:null,currency:null};
  const inventoryReverse=path.match(/^\/inventory\/movements\/([^/]+)\/reverse$/);
  if(method==='POST'&&inventoryReverse){const movement=await prisma.inventoryMovement.findFirst({where:{id:inventoryReverse[1],tenantId:input.tenantId},select:{id:true,productId:true,type:true,quantity:true}});if(!movement)throw new HttpError(404,'Movimiento de inventario no encontrado para preparar aprobación.');return {capability:'inventory.reverse',payload:{movementId:movement.id,productId:movement.productId,type:movement.type,quantity:decimalString(movement.quantity,3),reasonCode:body.reasonCode||'REVERSAL',reason:body.reason},amount:null,currency:null};}
  if(method==='POST'&&path==='/fiscal/reopen-period')return {capability:'fiscal.reopen',payload:{period:body.period,module:body.module,reason:body.reason},amount:null,currency:null};
  const ledgerPost=path.match(/^\/accounting\/entries\/([^/]+)\/post$/);
  if(method==='POST'&&ledgerPost){const entry=await prisma.ledgerEntry.findFirst({where:{id:ledgerPost[1],tenantId:input.tenantId},include:{lines:true}});if(!entry)throw new HttpError(404,'Asiento no encontrado para preparar aprobación.');const debit=entry.lines.reduce((sum,line)=>sum.plus(line.debit),money(0));return {capability:'accounting.post',payload:{entryId:entry.id,fiscalPeriod:entry.fiscalPeriod,description:entry.description,source:entry.source,lines:entry.lines.map((line)=>({accountCode:line.accountCode,accountName:line.accountName,debit:decimalString(line.debit),credit:decimalString(line.credit),currency:line.currency,exchangeRate:decimalString(line.exchangeRate,4)}))},amount:decimalString(debit),currency:entry.lines[0]?.currency||'VES'};}
  const ledgerReverse=path.match(/^\/accounting\/entries\/([^/]+)\/reverse$/);
  if(method==='POST'&&ledgerReverse){const entry=await prisma.ledgerEntry.findFirst({where:{id:ledgerReverse[1],tenantId:input.tenantId},include:{lines:true}});if(!entry)throw new HttpError(404,'Asiento no encontrado para preparar aprobación.');const debit=entry.lines.reduce((sum,line)=>sum.plus(line.debit),money(0));return {capability:'accounting.reverse',payload:{entryId:entry.id,originalPostedAt:entry.postedAt?.toISOString()||null,fiscalPeriod:body.fiscalPeriod,date:body.date||null,description:body.description||null,amount:decimalString(debit)},amount:decimalString(debit),currency:entry.lines[0]?.currency||'VES'};}
  return null;
}

export async function approvalExecutionGate(req:Request,res:Response,next:NextFunction){
  try{
    const tenantId=String((req as any).context?.tenantId||'');if(!tenantId)return next();
    const execution=await buildApprovalExecutionContext({tenantId,method:req.method,path:req.path,body:req.body});if(!execution)return next();
    const policy=await getActiveApprovalPolicy(tenantId,execution.capability);if(!approvalPolicyApplies(policy,execution.amount,execution.currency))return next();
    const approvalRequestId=String(req.header('x-approval-request-id')||'').trim()||null;
    const claimed=await claimApproval({tenantId,approvalRequestId,capability:execution.capability,payload:execution.payload,amount:execution.amount,currency:execution.currency});
    let settled=false;const settle=async()=>{if(settled)return;settled=true;try{if(res.statusCode>=200&&res.statusCode<400){const resourceId=String(res.getHeader('x-resource-id')||approvalRequestId||'operation');await finishApprovalClaim(claimed,'http-operation',resourceId);}else await releaseApprovalClaim(claimed);}catch(error){console.error('approval.execution.settle_failed',{capability:execution.capability,requestId:claimed?.id||null,error:error instanceof Error?error.message:'unknown'});}};
    res.once('finish',()=>{void settle();});res.once('close',()=>{if(!res.writableFinished)void settle();});
    next();
  }catch(error){next(error);}
}
