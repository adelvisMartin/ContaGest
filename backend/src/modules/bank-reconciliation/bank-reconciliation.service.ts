import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { add, money, serializeDecimal, subtract, ZERO } from '../../shared/financial/decimal.js';
import { canonicalRequestHash, normalizeIdempotencyKey } from '../../shared/services/financial-idempotency.service.js';
import { createLedgerEntry, postLedgerEntry, reverseLedgerEntry } from '../accounting/accounting.service.js';
import { claimApproval, finishApprovalClaim, releaseApprovalClaim } from '../approvals/approvals.service.js';
import { parseBankStatement, statementLineHash, statementSourceHash } from './statement-parser.js';

export const BANK_RECONCILIATION_AUTO_THRESHOLD = '0.9500';
export type ReconciliationStatus = 'unmatched'|'suggested'|'partial'|'reconciled'|'conflict';
export type TargetType = 'bank_movement'|'sales_invoice'|'purchase_invoice'|'ledger_entry'|'transfer';

type StatementLineRow = {
  id:string; tenantId:string; importId:string; accountId:string; bankLineId:string|null; lineHash:string;
  bookedAt:Date; valueDate:Date|null; amount:Prisma.Decimal; currency:string; reference:string|null;
  memo:string|null; counterparty:string|null; raw:unknown; normalized:unknown; status:ReconciliationStatus; createdAt:Date;
};
type ReconciliationRow = {
  id:string; tenantId:string; accountId:string; statementLineId:string; kind:string; status:string;
  confidence:Prisma.Decimal|null; reasons:unknown; matchedAmount:Prisma.Decimal; writeoffAccountCode:string|null;
  writeoffReason:string|null; ledgerEntryId:string|null; idempotencyKey:string|null; requestHash:string|null; createdBy:string|null;
  createdAt:Date; reversedBy:string|null; reversedAt:Date|null; reversalLedgerEntryId:string|null;
};
type CandidateDirection = 'in'|'out'|'any';
type CandidateTarget = {
  targetType:TargetType; targetId:string; label:string; amount:Prisma.Decimal; currency:string; date:Date;
  reference:string|null; partner:string|null; memo:string|null; direction:CandidateDirection;
};
type Candidate = {
  targetType:TargetType;
  targetId:string;
  label:string;
  amount:string;
  remaining:string;
  currency:string;
  date:string;
  reference:string|null;
  partner:string|null;
  confidence:number;
  reasons:string[];
  blockedReason:string|null;
};
type ReconciliationAllocationInput={targetType:TargetType;targetId:string;amount:string};

type DbClient = Prisma.TransactionClient|typeof prisma;
const normalize = (value:unknown) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const absoluteMoney = (value:Prisma.Decimal|string|number) => money(value).abs();
const exact = (value:Prisma.Decimal|string|number) => serializeDecimal(value,2);
const dateDistanceDays = (left:Date,right:Date) => Math.abs(left.getTime()-right.getTime())/86_400_000;
const safeJson = (value:unknown) => JSON.stringify(value ?? null);
const lineDirection=(line:StatementLineRow):'in'|'out'=>money(line.amount).isPositive()?'in':'out';
const oppositeDirection=(direction:'in'|'out'):'in'|'out'=>direction==='in'?'out':'in';
const canonicalTargetType=(type:TargetType)=>type==='transfer'?'bank_movement':type;

function requireIdempotencyKey(value:string) {
  const key=normalizeIdempotencyKey(value);
  if(!key) throw new HttpError(428,'Idempotency-Key es obligatorio para conciliación financiera.',{code:'IDEMPOTENCY_KEY_REQUIRED'});
  return key;
}

function assertIdempotencyIntent(row:ReconciliationRow,requestHash:string) {
  if(row.requestHash!==requestHash) {
    throw new HttpError(409,'Idempotency-Key ya fue utilizada con un request diferente.',{code:'IDEMPOTENCY_KEY_REUSED',scope:'bank-reconciliation'});
  }
}

function reconciliationIntentHash(input:{lineId:string;allocations:ReconciliationAllocationInput[];confidence?:number;reasons?:string[]}) {
  const allocations=input.allocations.map((item)=>({targetType:item.targetType,targetId:item.targetId,amount:exact(money(item.amount))}))
    .sort((a,b)=>`${canonicalTargetType(a.targetType)}:${a.targetId}:${a.amount}`.localeCompare(`${canonicalTargetType(b.targetType)}:${b.targetId}:${b.amount}`));
  return canonicalRequestHash({operation:'reconcile',lineId:input.lineId,allocations,confidence:input.confidence??null,reasons:[...(input.reasons||['manual_review'])].sort()});
}

async function getLine(tenantId:string,lineId:string,tx:DbClient=prisma) {
  const rows = await tx.$queryRaw<StatementLineRow[]>(Prisma.sql`
    SELECT * FROM "BankStatementLine" WHERE "tenantId"=${tenantId} AND "id"=${lineId} LIMIT 1
  `);
  if(!rows[0]) throw new HttpError(404,'Línea de extracto no encontrada para el tenant activo.');
  return rows[0];
}

async function lockLine(tx:Prisma.TransactionClient,tenantId:string,lineId:string) {
  const rows=await tx.$queryRaw<StatementLineRow[]>(Prisma.sql`
    SELECT * FROM "BankStatementLine" WHERE "tenantId"=${tenantId} AND "id"=${lineId} FOR UPDATE
  `);
  if(!rows[0]) throw new HttpError(404,'Línea de extracto no encontrada para el tenant activo.');
  return rows[0];
}

async function lockAllocationTargets(tx:Prisma.TransactionClient,tenantId:string,allocations:ReconciliationAllocationInput[]) {
  const keys=[...new Set(allocations.map((item)=>`${canonicalTargetType(item.targetType)}:${item.targetId}`))].sort();
  for(const key of keys) {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${key}`},0))`);
  }
}

async function activeAllocatedForLine(tx:DbClient,tenantId:string,lineId:string) {
  const rows=await tx.$queryRaw<Array<{total:Prisma.Decimal|null}>>(Prisma.sql`
    SELECT COALESCE(SUM(r."matchedAmount"),0)::numeric(18,2) AS total
    FROM "BankReconciliation" r
    WHERE r."tenantId"=${tenantId} AND r."statementLineId"=${lineId} AND r."status"='confirmed'
  `);
  return money(rows[0]?.total ?? ZERO);
}

async function activeAllocatedForTarget(tx:DbClient,tenantId:string,targetType:TargetType,targetId:string) {
  const targetFilter=canonicalTargetType(targetType)==='bank_movement'
    ? Prisma.sql`a."targetType" IN ('bank_movement','transfer')`
    : Prisma.sql`a."targetType"=${targetType}`;
  const rows=await tx.$queryRaw<Array<{total:Prisma.Decimal|null}>>(Prisma.sql`
    SELECT COALESCE(SUM(a."amount"),0)::numeric(18,2) AS total
    FROM "BankReconciliationAllocation" a
    JOIN "BankReconciliation" r ON r."id"=a."reconciliationId" AND r."tenantId"=a."tenantId"
    WHERE a."tenantId"=${tenantId} AND ${targetFilter} AND a."targetId"=${targetId} AND r."status"='confirmed'
  `);
  return money(rows[0]?.total ?? ZERO);
}

async function recalcLineStatus(tx:Prisma.TransactionClient,tenantId:string,line:StatementLineRow) {
  const allocated=await activeAllocatedForLine(tx,tenantId,line.id);
  const total=absoluteMoney(line.amount);
  const next:ReconciliationStatus=allocated.isZero()?'unmatched':allocated.eq(total)?'reconciled':'partial';
  if(allocated.gt(total)) throw new HttpError(409,'La conciliación excedería el monto de la línea.',{code:'BANK_RECONCILIATION_OVERALLOCATED'});
  await tx.$executeRaw(Prisma.sql`UPDATE "BankStatementLine" SET "status"=${next} WHERE "tenantId"=${tenantId} AND "id"=${line.id}`);
  return {status:next,allocated:exact(allocated),remaining:exact(total.minus(allocated))};
}

async function auditTx(tx:Prisma.TransactionClient,input:{tenantId:string;userId?:string;action:string;entity:string;entityId:string;after?:unknown}) {
  await tx.auditLog.create({data:{tenantId:input.tenantId,userId:input.userId||null,action:input.action,entity:input.entity,entityId:input.entityId,after:(input.after??{}) as Prisma.InputJsonValue}});
}

export async function importBankStatement(input:{tenantId:string;userId?:string;accountId:string;fileName:string;mimeType?:string;bytes:Buffer;sourceMetadata?:Record<string,unknown>}) {
  const account=await prisma.bankAccount.findFirst({where:{id:input.accountId,tenantId:input.tenantId,active:true},select:{id:true,currency:true}});
  if(!account) throw new HttpError(404,'Cuenta bancaria no encontrada para el tenant activo.');
  const parsed=parseBankStatement({fileName:input.fileName,mimeType:input.mimeType,bytes:input.bytes,defaultCurrency:account.currency});
  if(parsed.currency!==account.currency) throw new HttpError(409,'La moneda del extracto no coincide con la cuenta bancaria.',{code:'BANK_STATEMENT_ACCOUNT_CURRENCY_MISMATCH',accountCurrency:account.currency,statementCurrency:parsed.currency});
  const sourceHash=statementSourceHash(input.bytes);
  return prisma.$transaction(async(tx)=>{
    const importId=randomUUID();
    const insertedImport=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
      INSERT INTO "BankStatementImport" ("id","tenantId","accountId","fileName","format","parserName","parserVersion","sourceHash","rawContent","openingBalance","closingBalance","currency","status","sourceMetadata","uploadedBy")
      VALUES (${importId},${input.tenantId},${input.accountId},${input.fileName},${parsed.format},${parsed.parserName},${parsed.parserVersion},${sourceHash},${input.bytes},${parsed.openingBalance?money(parsed.openingBalance):null},${parsed.closingBalance?money(parsed.closingBalance):null},${parsed.currency},'imported',${safeJson(input.sourceMetadata||{})}::jsonb,${input.userId||null})
      ON CONFLICT ("tenantId","accountId","sourceHash") DO NOTHING
      RETURNING "id"
    `);
    if(!insertedImport.length){
      const existing=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "BankStatementImport" WHERE "tenantId"=${input.tenantId} AND "accountId"=${input.accountId} AND "sourceHash"=${sourceHash} LIMIT 1`);
      if(!existing[0]) throw new HttpError(409,'No fue posible reconstruir el import idempotente.',{code:'BANK_STATEMENT_IMPORT_STATE_UNAVAILABLE'});
      return {duplicate:true,importId:existing[0].id,inserted:0,deduplicated:parsed.lines.length,parserVersion:parsed.parserVersion};
    }
    let inserted=0;
    for(const line of parsed.lines){
      const id=randomUUID(); const lineHash=statementLineHash(line);
      const normalized={bankLineId:line.bankLineId,bookedAt:line.bookedAt.toISOString(),valueDate:line.valueDate?.toISOString()||null,amount:line.amount,currency:line.currency,reference:line.reference,memo:line.memo,counterparty:line.counterparty,parserVersion:parsed.parserVersion};
      const changed=await tx.$executeRaw(Prisma.sql`
        INSERT INTO "BankStatementLine" ("id","tenantId","importId","accountId","bankLineId","lineHash","bookedAt","valueDate","amount","currency","reference","memo","counterparty","raw","normalized","status")
        VALUES (${id},${input.tenantId},${importId},${input.accountId},${line.bankLineId},${lineHash},${line.bookedAt},${line.valueDate},${money(line.amount)},${line.currency},${line.reference},${line.memo},${line.counterparty},${safeJson(line.raw)}::jsonb,${safeJson(normalized)}::jsonb,'unmatched')
        ON CONFLICT DO NOTHING
      `);
      inserted+=Number(changed);
    }
    await auditTx(tx,{tenantId:input.tenantId,userId:input.userId,action:'bank-reconciliation.statement.imported',entity:'BankStatementImport',entityId:importId,after:{sourceHash,format:parsed.format,parserVersion:parsed.parserVersion,inserted,deduplicated:parsed.lines.length-inserted}});
    return {duplicate:false,importId,inserted,deduplicated:parsed.lines.length-inserted,parserVersion:parsed.parserVersion};
  });
}

export async function listStatementImports(tenantId:string,accountId?:string,take=50) {
  const bounded=Math.max(1,Math.min(Number(take)||50,200));
  const accountFilter=accountId?Prisma.sql`AND i."accountId"=${accountId}`:Prisma.empty;
  return prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT i."id",i."accountId",i."fileName",i."format",i."parserName",i."parserVersion",i."sourceHash",i."openingBalance",i."closingBalance",i."currency",i."status",i."sourceMetadata",i."uploadedBy",i."createdAt",
      COUNT(l."id")::int AS "lineCount"
    FROM "BankStatementImport" i LEFT JOIN "BankStatementLine" l ON l."importId"=i."id" AND l."tenantId"=i."tenantId"
    WHERE i."tenantId"=${tenantId} ${accountFilter}
    GROUP BY i."id" ORDER BY i."createdAt" DESC LIMIT ${bounded}
  `);
}

export async function listStatementLines(tenantId:string,input:{accountId?:string;status?:string;take?:number}={}) {
  const bounded=Math.max(1,Math.min(Number(input.take)||200,500));
  const accountFilter=input.accountId?Prisma.sql`AND l."accountId"=${input.accountId}`:Prisma.empty;
  const statusFilter=input.status&&input.status!=='all'?Prisma.sql`AND l."status"=${input.status}`:Prisma.empty;
  const rows=await prisma.$queryRaw<StatementLineRow[]>(Prisma.sql`
    SELECT l.* FROM "BankStatementLine" l WHERE l."tenantId"=${tenantId} ${accountFilter} ${statusFilter}
    ORDER BY l."bookedAt" DESC,l."createdAt" DESC LIMIT ${bounded}
  `);
  return Promise.all(rows.map(async(line)=>{
    const allocated=await activeAllocatedForLine(prisma,tenantId,line.id); const total=absoluteMoney(line.amount);
    return {...line,amount:exact(line.amount),allocated:exact(allocated),remaining:exact(total.minus(allocated))};
  }));
}

async function targetCandidates(tenantId:string,line:StatementLineRow) {
  const from=new Date(line.bookedAt.getTime()-7*86_400_000); const to=new Date(line.bookedAt.getTime()+7*86_400_000);
  const [movements,sales,purchases,ledger]=await Promise.all([
    prisma.bankMovement.findMany({where:{tenantId,date:{gte:from,lte:to}},include:{account:true},take:150,orderBy:{date:'desc'}}),
    prisma.salesInvoice.findMany({where:{tenantId,issueDate:{gte:from,lte:to},status:{not:'cancelled'}},include:{client:true},take:100,orderBy:{issueDate:'desc'}}),
    prisma.purchaseInvoice.findMany({where:{tenantId,issueDate:{gte:from,lte:to},status:{not:'cancelled'}},include:{supplier:true},take:100,orderBy:{issueDate:'desc'}}),
    prisma.ledgerEntry.findMany({where:{tenantId,date:{gte:from,lte:to},posted:true,reversalOfId:null},include:{lines:true},take:100,orderBy:{date:'desc'}})
  ]);
  const rows:CandidateTarget[]=[];
  for(const row of movements){
    const amount=money(row.credit).gt(0)?money(row.credit):money(row.debit);
    const movementDirection:'in'|'out'=money(row.credit).gt(0)?'in':'out';
    const sameAccount=row.accountId===line.accountId;
    rows.push({targetType:sameAccount?'bank_movement':'transfer',targetId:row.id,label:`${row.description} · ${row.account.bankName}`,amount,currency:row.account.currency,date:row.date,reference:row.reference,partner:null,memo:row.description,direction:sameAccount?movementDirection:oppositeDirection(movementDirection)});
  }
  for(const row of sales) rows.push({targetType:'sales_invoice',targetId:row.id,label:`CxC ${row.number}${row.client?.name?` · ${row.client.name}`:''}`,amount:money(row.total),currency:row.currency||'VES',date:row.issueDate,reference:row.number,partner:row.client?.name||null,memo:row.notes||null,direction:'in'});
  for(const row of purchases) rows.push({targetType:'purchase_invoice',targetId:row.id,label:`CxP ${row.number}${row.supplier?.name?` · ${row.supplier.name}`:''}`,amount:money(row.total),currency:'VES',date:row.issueDate,reference:row.number,partner:row.supplier?.name||null,memo:null,direction:'out'});
  for(const row of ledger){const debit=add(...row.lines.map((item)=>item.debit));rows.push({targetType:'ledger_entry',targetId:row.id,label:`Asiento · ${row.description}`,amount:money(debit),currency:row.lines[0]?.currency||'VES',date:row.date,reference:row.sourceId||null,partner:null,memo:row.description,direction:'any'});}
  return rows;
}

function scoreCandidate(line:StatementLineRow,target:CandidateTarget,remaining:Prisma.Decimal):{confidence:number;reasons:string[];blockedReason:string|null} {
  if(target.currency!==line.currency) return {confidence:0,reasons:['currency_mismatch'],blockedReason:'FX_REQUIRES_EXPLICIT_POSTING'};
  if(target.direction!=='any'&&target.direction!==lineDirection(line)) return {confidence:0,reasons:['direction_mismatch'],blockedReason:'DIRECTION_MISMATCH'};
  const reasons:string[]=[]; let score=0;
  const ref=normalize(line.reference),targetRef=normalize(target.reference);
  if(ref&&targetRef&&ref===targetRef){score+=0.55;reasons.push('exact_reference');}
  const partner=normalize(line.counterparty),targetPartner=normalize(target.partner);
  if(partner&&targetPartner&&(partner.includes(targetPartner)||targetPartner.includes(partner))){score+=0.20;reasons.push('partner_match');}
  if(absoluteMoney(line.amount).eq(remaining)){score+=0.25;reasons.push('exact_remaining_amount');}
  else if(absoluteMoney(line.amount).eq(target.amount)){score+=0.20;reasons.push('exact_amount');}
  const days=dateDistanceDays(line.bookedAt,target.date);
  if(days<=2){score+=0.12;reasons.push('date_window_2d');} else if(days<=7){score+=0.06;reasons.push('date_window_7d');}
  const memo=normalize(line.memo); const targetMemo=normalize(target.memo);
  if(memo&&((targetRef&&memo.includes(targetRef))||(targetMemo&&targetMemo.includes(memo)))){score+=0.08;reasons.push('memo_reference');}
  return {confidence:Math.min(1,Number(score.toFixed(4))),reasons,blockedReason:null};
}

export async function getMatchingCandidates(tenantId:string,lineId:string) {
  const line=await getLine(tenantId,lineId); const targets=await targetCandidates(tenantId,line); const candidates:Candidate[]=[];
  for(const target of targets){
    const used=await activeAllocatedForTarget(prisma,tenantId,target.targetType,target.targetId); const remaining=target.amount.minus(used);
    if(!remaining.isPositive()) continue;
    const scored=scoreCandidate(line,target,remaining);
    if(scored.confidence<0.05&&!scored.blockedReason) continue;
    candidates.push({targetType:target.targetType,targetId:target.targetId,label:target.label,amount:exact(target.amount),remaining:exact(remaining),currency:target.currency,date:target.date.toISOString(),reference:target.reference,partner:target.partner,confidence:scored.confidence,reasons:scored.reasons,blockedReason:scored.blockedReason});
  }
  candidates.sort((a,b)=>b.confidence-a.confidence || a.label.localeCompare(b.label));
  const actionable=candidates.filter((item)=>!item.blockedReason);
  const top=actionable[0]?.confidence||0; const tied=actionable.filter((item)=>item.confidence===top&&top>=0.70).length>1;
  const nextStatus:ReconciliationStatus=tied?'conflict':actionable.length?'suggested':'unmatched';
  if(!['partial','reconciled'].includes(line.status)&&line.status!==nextStatus){
    await prisma.$transaction(async(tx)=>{
      await tx.$executeRaw(Prisma.sql`UPDATE "BankStatementLine" SET "status"=${nextStatus} WHERE "tenantId"=${tenantId} AND "id"=${line.id}`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO "BankReconciliationEvent" ("id","tenantId","statementLineId","type","payload") VALUES (${randomUUID()},${tenantId},${line.id},'candidates.generated',${safeJson({count:candidates.length,topConfidence:top,status:nextStatus})}::jsonb)`);
    });
  }
  return {line:{...line,amount:exact(line.amount)},status:nextStatus,autoThreshold:BANK_RECONCILIATION_AUTO_THRESHOLD,requiresReview:top<Number(BANK_RECONCILIATION_AUTO_THRESHOLD)||tied,candidates};
}

async function resolveTarget(tx:Prisma.TransactionClient,tenantId:string,line:StatementLineRow,type:TargetType,id:string) {
  if(type==='bank_movement'||type==='transfer'){
    const row=await tx.bankMovement.findFirst({where:{id,tenantId},include:{account:true}}); if(!row) throw new HttpError(404,'Movimiento candidato no encontrado.');
    const sameAccount=row.accountId===line.accountId;
    if(type==='bank_movement'&&!sameAccount) throw new HttpError(409,'El candidato pertenece a otra cuenta; usa tipo transfer.',{code:'BANK_RECONCILIATION_TARGET_TYPE_MISMATCH'});
    if(type==='transfer'&&sameAccount) throw new HttpError(409,'Una transferencia debe apuntar a otra cuenta del tenant.',{code:'BANK_RECONCILIATION_TARGET_TYPE_MISMATCH'});
    const amount=money(row.credit).gt(0)?money(row.credit):money(row.debit);
    const movementDirection:'in'|'out'=money(row.credit).gt(0)?'in':'out';
    const direction=sameAccount?movementDirection:oppositeDirection(movementDirection);
    return {amount,currency:row.account.currency,direction};
  }
  if(type==='sales_invoice') {const row=await tx.salesInvoice.findFirst({where:{id,tenantId}});if(!row)throw new HttpError(404,'CxC candidata no encontrada.');return {amount:money(row.total),currency:row.currency||'VES',direction:'in' as const};}
  if(type==='purchase_invoice') {const row=await tx.purchaseInvoice.findFirst({where:{id,tenantId}});if(!row)throw new HttpError(404,'CxP candidata no encontrada.');return {amount:money(row.total),currency:'VES',direction:'out' as const};}
  const row=await tx.ledgerEntry.findFirst({where:{id,tenantId,posted:true},include:{lines:true}});if(!row)throw new HttpError(404,'Asiento candidato no encontrado.');return {amount:add(...row.lines.map((item)=>item.debit)),currency:row.lines[0]?.currency||'VES',direction:'any' as const};
}

export async function reconcileStatementLine(input:{tenantId:string;userId?:string;lineId:string;idempotencyKey:string;allocations:ReconciliationAllocationInput[];confidence?:number;reasons?:string[]}) {
  const idempotencyKey=requireIdempotencyKey(input.idempotencyKey);
  if(!input.allocations.length||input.allocations.length>50) throw new HttpError(422,'Indica entre 1 y 50 asignaciones.');
  const requestHash=reconciliationIntentHash(input);
  return prisma.$transaction(async(tx)=>{
    const replay=await tx.$queryRaw<ReconciliationRow[]>(Prisma.sql`SELECT * FROM "BankReconciliation" WHERE "tenantId"=${input.tenantId} AND "idempotencyKey"=${idempotencyKey} LIMIT 1 FOR UPDATE`);
    if(replay[0]) {assertIdempotencyIntent(replay[0],requestHash);return {replayed:true,reconciliation:replay[0],line:await getLine(input.tenantId,replay[0].statementLineId,tx)};}
    const line=await lockLine(tx,input.tenantId,input.lineId); const already=await activeAllocatedForLine(tx,input.tenantId,line.id); const lineRemaining=absoluteMoney(line.amount).minus(already);
    if(!lineRemaining.isPositive()) throw new HttpError(409,'La línea ya está conciliada completamente.',{code:'BANK_RECONCILIATION_ALREADY_COMPLETE'});
    await lockAllocationTargets(tx,input.tenantId,input.allocations);
    let total=money(0);
    for(const allocation of input.allocations){
      const amount=money(allocation.amount); if(!amount.isPositive()) throw new HttpError(422,'Cada asignación debe ser mayor que cero.');
      const target=await resolveTarget(tx,input.tenantId,line,allocation.targetType,allocation.targetId);
      if(target.currency!==line.currency) throw new HttpError(409,'No se permite conciliación FX implícita.',{code:'BANK_RECONCILIATION_FX_EXPLICIT_REQUIRED'});
      if(target.direction!=='any'&&target.direction!==lineDirection(line)) throw new HttpError(409,'La dirección del candidato no corresponde con la línea bancaria.',{code:'BANK_RECONCILIATION_DIRECTION_MISMATCH'});
      const used=await activeAllocatedForTarget(tx,input.tenantId,allocation.targetType,allocation.targetId);
      const targetRemaining=money(target.amount).minus(used); if(amount.gt(targetRemaining)) throw new HttpError(409,'La asignación excede el saldo pendiente del candidato.',{code:'BANK_RECONCILIATION_TARGET_OVERALLOCATED',targetId:allocation.targetId,remaining:exact(targetRemaining)});
      total=total.plus(amount);
    }
    if(total.gt(lineRemaining)) throw new HttpError(409,'La suma de asignaciones excede la línea del extracto.',{code:'BANK_RECONCILIATION_LINE_OVERALLOCATED',remaining:exact(lineRemaining)});
    const id=randomUUID(); const kind=total.eq(lineRemaining)&&already.isZero()?'match':'partial';
    await tx.$executeRaw(Prisma.sql`INSERT INTO "BankReconciliation" ("id","tenantId","accountId","statementLineId","kind","status","confidence","reasons","matchedAmount","idempotencyKey","requestHash","createdBy") VALUES (${id},${input.tenantId},${line.accountId},${line.id},${kind},'confirmed',${input.confidence??null},${safeJson(input.reasons||['manual_review'])}::jsonb,${total},${idempotencyKey},${requestHash},${input.userId||null})`);
    for(const allocation of input.allocations) await tx.$executeRaw(Prisma.sql`INSERT INTO "BankReconciliationAllocation" ("id","tenantId","reconciliationId","targetType","targetId","amount") VALUES (${randomUUID()},${input.tenantId},${id},${allocation.targetType},${allocation.targetId},${money(allocation.amount)})`);
    const state=await recalcLineStatus(tx,input.tenantId,line);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "BankReconciliationEvent" ("id","tenantId","statementLineId","reconciliationId","type","payload","actorId") VALUES (${randomUUID()},${input.tenantId},${line.id},${id},'reconciliation.confirmed',${safeJson({kind,allocations:input.allocations,state})}::jsonb,${input.userId||null})`);
    await auditTx(tx,{tenantId:input.tenantId,userId:input.userId,action:'bank-reconciliation.confirmed',entity:'BankReconciliation',entityId:id,after:{statementLineId:line.id,kind,matchedAmount:exact(total),allocations:input.allocations}});
    const rows=await tx.$queryRaw<ReconciliationRow[]>(Prisma.sql`SELECT * FROM "BankReconciliation" WHERE "id"=${id}`);
    return {replayed:false,reconciliation:rows[0],line:{...line,...state}};
  });
}

export async function listReconciliationModels(tenantId:string) {
  return prisma.$queryRaw<Array<any>>(Prisma.sql`SELECT * FROM "BankReconciliationModel" WHERE "tenantId"=${tenantId} ORDER BY "active" DESC,"name","version" DESC`);
}

export async function createReconciliationModel(input:{tenantId:string;userId?:string;name:string;memoPattern:string;accountCode:string;accountName:string;reasonCode:string;autoApply?:boolean;minConfidence?:string}) {
  const account=await prisma.chartAccount.findFirst({where:{tenantId:input.tenantId,code:input.accountCode,active:true,allowPosting:true},select:{code:true,name:true}});
  if(!account) throw new HttpError(422,'La cuenta contable del modelo no existe o no permite posting.');
  const rows=await prisma.$queryRaw<Array<{version:number}>>(Prisma.sql`SELECT COALESCE(MAX("version"),0)+1 AS version FROM "BankReconciliationModel" WHERE "tenantId"=${input.tenantId} AND "name"=${input.name}`);
  const version=Number(rows[0]?.version||1); const min=Number(input.minConfidence??BANK_RECONCILIATION_AUTO_THRESHOLD);
  if(!Number.isFinite(min)||min<0||min>1) throw new HttpError(422,'minConfidence debe estar entre 0 y 1.');
  const id=randomUUID();
  const created=await prisma.$queryRaw<Array<any>>(Prisma.sql`INSERT INTO "BankReconciliationModel" ("id","tenantId","name","version","active","memoPattern","accountCode","accountName","reasonCode","autoApply","minConfidence","createdBy") VALUES (${id},${input.tenantId},${input.name},${version},true,${input.memoPattern},${account.code},${account.name},${input.reasonCode},${Boolean(input.autoApply)},${min},${input.userId||null}) RETURNING *`);
  return created[0];
}

export async function createWriteoff(input:{tenantId:string;userId:string;lineId:string;idempotencyKey:string;amount:string;writeoffAccountCode:string;bankLedgerAccountCode:string;reason:string;fiscalPeriod:string;approvalRequestId?:string|null}) {
  const idempotencyKey=requireIdempotencyKey(input.idempotencyKey);
  const line=await getLine(input.tenantId,input.lineId); const amount=money(input.amount);
  if(!amount.isPositive()) throw new HttpError(422,'El write-off debe ser mayor que cero.');
  const accounts=await prisma.chartAccount.findMany({where:{tenantId:input.tenantId,code:{in:[input.writeoffAccountCode,input.bankLedgerAccountCode]},active:true,allowPosting:true},select:{code:true,name:true}});
  const writeoff=accounts.find((item)=>item.code===input.writeoffAccountCode), bankGl=accounts.find((item)=>item.code===input.bankLedgerAccountCode);
  if(!writeoff||!bankGl) throw new HttpError(422,'Ambas cuentas contables deben existir, estar activas y permitir posting.');
  const approvalPayload={lineId:line.id,accountId:line.accountId,amount:exact(amount),currency:line.currency,writeoffAccountCode:writeoff.code,bankLedgerAccountCode:bankGl.code,reason:input.reason,fiscalPeriod:input.fiscalPeriod};
  const requestHash=canonicalRequestHash({operation:'writeoff',...approvalPayload,approvalRequestId:input.approvalRequestId||null});
  const existing=await prisma.$queryRaw<ReconciliationRow[]>(Prisma.sql`SELECT * FROM "BankReconciliation" WHERE "tenantId"=${input.tenantId} AND "idempotencyKey"=${idempotencyKey} LIMIT 1`);
  if(existing[0]) assertIdempotencyIntent(existing[0],requestHash);
  if(existing[0]?.status==='confirmed') {
    if(input.approvalRequestId) await finishApprovalClaim({id:input.approvalRequestId} as any,'BankReconciliation',existing[0].id);
    return {replayed:true,reconciliation:existing[0]};
  }
  let claim:any=null; let reconciliation=existing[0]||null; let ledgerPosted=false;
  if(reconciliation){
    const metadata=Array.isArray(reconciliation.reasons)?reconciliation.reasons:[];
    const stored=(metadata as any[]).find((item)=>item&&typeof item==='object'&&'approvalRequestId' in item) as any;
    if(stored?.approvalRequestId!==String(input.approvalRequestId||'')) throw new HttpError(409,'El retry debe usar la misma aprobación del write-off original.',{code:'BANK_RECONCILIATION_APPROVAL_RETRY_MISMATCH'});
  } else {
    claim=await claimApproval({tenantId:input.tenantId,approvalRequestId:input.approvalRequestId||null,capability:'banking.correct',payload:approvalPayload,amount,currency:line.currency});
    try{
      reconciliation=await prisma.$transaction(async(tx)=>{
        const locked=await lockLine(tx,input.tenantId,line.id); const allocated=await activeAllocatedForLine(tx,input.tenantId,line.id); const remaining=absoluteMoney(locked.amount).minus(allocated);
        if(amount.gt(remaining)) throw new HttpError(409,'El write-off excede el saldo pendiente de la línea.',{code:'BANK_RECONCILIATION_LINE_OVERALLOCATED',remaining:exact(remaining)});
        const id=randomUUID(); const rows=await tx.$queryRaw<ReconciliationRow[]>(Prisma.sql`INSERT INTO "BankReconciliation" ("id","tenantId","accountId","statementLineId","kind","status","confidence","reasons","matchedAmount","writeoffAccountCode","writeoffReason","idempotencyKey","requestHash","createdBy") VALUES (${id},${input.tenantId},${locked.accountId},${locked.id},'writeoff','pending',1,${safeJson(['writeoff_manual',{approvalRequestId:String(input.approvalRequestId||'')}])}::jsonb,${amount},${writeoff.code},${input.reason},${idempotencyKey},${requestHash},${input.userId}) RETURNING *`);
        return rows[0];
      });
    } catch(error){await releaseApprovalClaim(claim);throw error;}
  }
  try{
    const sourceId=`bank-reconciliation:${reconciliation!.id}`;
    let ledger=await prisma.ledgerEntry.findFirst({where:{tenantId:input.tenantId,source:'banking',sourceId},include:{lines:true,reversedBy:true}});
    if(!ledger){
      const positive=money(line.amount).isPositive();
      ledger=await createLedgerEntry({tenantId:input.tenantId,fiscalPeriod:input.fiscalPeriod,description:`Write-off conciliación bancaria: ${input.reason}`,source:'banking',sourceId,lines:positive?
        [{accountCode:bankGl.code,accountName:bankGl.name,debit:amount,currency:line.currency},{accountCode:writeoff.code,accountName:writeoff.name,credit:amount,currency:line.currency}]:
        [{accountCode:writeoff.code,accountName:writeoff.name,debit:amount,currency:line.currency},{accountCode:bankGl.code,accountName:bankGl.name,credit:amount,currency:line.currency}]});
    }
    if(!ledger.posted) ledger=await postLedgerEntry({tenantId:input.tenantId,entryId:ledger.id,postedBy:input.userId});
    ledgerPosted=true;
    const result=await prisma.$transaction(async(tx)=>{
      const locked=await lockLine(tx,input.tenantId,line.id);
      await tx.$executeRaw(Prisma.sql`UPDATE "BankReconciliation" SET "status"='confirmed',"ledgerEntryId"=${ledger!.id} WHERE "tenantId"=${input.tenantId} AND "id"=${reconciliation!.id} AND "status"='pending'`);
      const prior=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "BankReconciliationAllocation" WHERE "tenantId"=${input.tenantId} AND "reconciliationId"=${reconciliation!.id} LIMIT 1`);
      if(!prior.length) await tx.$executeRaw(Prisma.sql`INSERT INTO "BankReconciliationAllocation" ("id","tenantId","reconciliationId","targetType","targetId","amount") VALUES (${randomUUID()},${input.tenantId},${reconciliation!.id},'writeoff',NULL,${amount})`);
      const state=await recalcLineStatus(tx,input.tenantId,locked);
      await tx.$executeRaw(Prisma.sql`INSERT INTO "BankReconciliationEvent" ("id","tenantId","statementLineId","reconciliationId","type","payload","actorId") VALUES (${randomUUID()},${input.tenantId},${locked.id},${reconciliation!.id},'writeoff.confirmed',${safeJson({ledgerEntryId:ledger!.id,state,approvalRequestId:input.approvalRequestId||null})}::jsonb,${input.userId})`);
      await auditTx(tx,{tenantId:input.tenantId,userId:input.userId,action:'bank-reconciliation.writeoff.confirmed',entity:'BankReconciliation',entityId:reconciliation!.id,after:{ledgerEntryId:ledger!.id,amount:exact(amount),reason:input.reason,state}});
      const rows=await tx.$queryRaw<ReconciliationRow[]>(Prisma.sql`SELECT * FROM "BankReconciliation" WHERE "id"=${reconciliation!.id}`);return rows[0];
    });
    if(claim) await finishApprovalClaim(claim,'BankReconciliation',result.id);
    else if(input.approvalRequestId) await finishApprovalClaim({id:input.approvalRequestId} as any,'BankReconciliation',result.id);
    return {replayed:Boolean(existing[0]),reconciliation:result};
  } catch(error){if(claim&&!ledgerPosted)await releaseApprovalClaim(claim);throw error;}
}

export async function reverseReconciliation(input:{tenantId:string;userId:string;reconciliationId:string;fiscalPeriod?:string;reason:string}) {
  const rows=await prisma.$queryRaw<ReconciliationRow[]>(Prisma.sql`SELECT * FROM "BankReconciliation" WHERE "tenantId"=${input.tenantId} AND "id"=${input.reconciliationId} LIMIT 1`); const reconciliation=rows[0];
  if(!reconciliation) throw new HttpError(404,'Conciliación no encontrada.');
  if(reconciliation.status==='reversed') return {replayed:true,reconciliation};
  let reversalLedgerEntryId:string|null=null;
  if(reconciliation.ledgerEntryId){
    const ledger=await prisma.ledgerEntry.findFirst({where:{id:reconciliation.ledgerEntryId,tenantId:input.tenantId},include:{reversedBy:true}});
    if(!ledger) throw new HttpError(409,'El asiento asociado al write-off no existe.');
    if(ledger.reversedBy) reversalLedgerEntryId=ledger.reversedBy.id;
    else {
      if(!input.fiscalPeriod) throw new HttpError(422,'Reversar un write-off requiere fiscalPeriod abierto.');
      const reversal=await reverseLedgerEntry({tenantId:input.tenantId,entryId:ledger.id,fiscalPeriod:input.fiscalPeriod,postedBy:input.userId,description:`Reverso de conciliación ${reconciliation.id}: ${input.reason}`});
      reversalLedgerEntryId=reversal.id;
    }
  }
  return prisma.$transaction(async(tx)=>{
    const line=await lockLine(tx,input.tenantId,reconciliation.statementLineId);
    const changed=await tx.$executeRaw(Prisma.sql`UPDATE "BankReconciliation" SET "status"='reversed',"reversedBy"=${input.userId},"reversedAt"=now(),"reversalLedgerEntryId"=${reversalLedgerEntryId} WHERE "tenantId"=${input.tenantId} AND "id"=${reconciliation.id} AND "status"<>'reversed'`);
    if(!Number(changed)){const current=await tx.$queryRaw<ReconciliationRow[]>(Prisma.sql`SELECT * FROM "BankReconciliation" WHERE "id"=${reconciliation.id}`);return {replayed:true,reconciliation:current[0]};}
    const state=await recalcLineStatus(tx,input.tenantId,line);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "BankReconciliationEvent" ("id","tenantId","statementLineId","reconciliationId","type","payload","actorId") VALUES (${randomUUID()},${input.tenantId},${line.id},${reconciliation.id},'reconciliation.reversed',${safeJson({reason:input.reason,reversalLedgerEntryId,state})}::jsonb,${input.userId})`);
    await auditTx(tx,{tenantId:input.tenantId,userId:input.userId,action:'bank-reconciliation.reversed',entity:'BankReconciliation',entityId:reconciliation.id,after:{reason:input.reason,reversalLedgerEntryId,state}});
    const current=await tx.$queryRaw<ReconciliationRow[]>(Prisma.sql`SELECT * FROM "BankReconciliation" WHERE "id"=${reconciliation.id}`);return {replayed:false,reconciliation:current[0],line:{...line,...state}};
  });
}

export async function getClosingBalanceSummary(tenantId:string,accountId:string,importId?:string) {
  const account=await prisma.bankAccount.findFirst({where:{id:accountId,tenantId,active:true}}); if(!account) throw new HttpError(404,'Cuenta bancaria no encontrada.');
  const importRows=await prisma.$queryRaw<Array<{id:string;closingBalance:Prisma.Decimal|null;openingBalance:Prisma.Decimal|null;currency:string;createdAt:Date}>>(importId?Prisma.sql`SELECT "id","closingBalance","openingBalance","currency","createdAt" FROM "BankStatementImport" WHERE "tenantId"=${tenantId} AND "accountId"=${accountId} AND "id"=${importId} LIMIT 1`:Prisma.sql`SELECT "id","closingBalance","openingBalance","currency","createdAt" FROM "BankStatementImport" WHERE "tenantId"=${tenantId} AND "accountId"=${accountId} ORDER BY "createdAt" DESC LIMIT 1`);
  const statement=importRows[0]; if(!statement) throw new HttpError(404,'No existe extracto importado para la cuenta.'); if(statement.closingBalance===null) return {importId:statement.id,currency:statement.currency,closingBalance:null,ledgerBalance:exact(account.balance),difference:null,exact:false,reason:'statement_closing_balance_unavailable'};
  const difference=subtract(statement.closingBalance,account.balance);
  const coverage=await prisma.$queryRaw<Array<{firstDate:Date|null;lastDate:Date|null;lines:number;unmatched:number}>>(Prisma.sql`SELECT MIN("bookedAt") AS "firstDate",MAX("bookedAt") AS "lastDate",COUNT(*)::int AS lines,COUNT(*) FILTER (WHERE "status"<>'reconciled')::int AS unmatched FROM "BankStatementLine" WHERE "tenantId"=${tenantId} AND "importId"=${statement.id}`);
  return {importId:statement.id,currency:statement.currency,closingBalance:exact(statement.closingBalance),ledgerBalance:exact(account.balance),difference:exact(difference),exact:difference.isZero(),coverage:coverage[0]||null};
}

export async function getReconciliationHistory(tenantId:string,lineId:string) {
  await getLine(tenantId,lineId);
  return prisma.$queryRaw<Array<any>>(Prisma.sql`SELECT e.*,r."kind",r."status" AS "reconciliationStatus",r."matchedAmount",r."ledgerEntryId",r."reversalLedgerEntryId" FROM "BankReconciliationEvent" e LEFT JOIN "BankReconciliation" r ON r."id"=e."reconciliationId" AND r."tenantId"=e."tenantId" WHERE e."tenantId"=${tenantId} AND e."statementLineId"=${lineId} ORDER BY e."createdAt" ASC`);
}
