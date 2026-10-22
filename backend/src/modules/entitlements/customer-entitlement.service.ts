import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { projectEntitlementLedger } from './entitlement-ledger-projection.mjs';

export type CustomerRightActor=Readonly<{tenantId:string;userId?:string;ip?:string;userAgent?:string}>;
const code=(key:string)=>({code:key});
function denied(status:number,message:string,key:string):never{
  throw new HttpError(status,message,code(key));
}
function requireActor(ctx:CustomerRightActor):string{
  const id=String(ctx.userId||'').trim();
  if(!id)denied(401,'Se necesita un actor autenticado.','ENTITLEMENT_ACTOR_REQUIRED');
  return id;
}
export type BenefitCreate=Readonly<{
  productId:string;name:string;scope:'ALL'|'SERVICE'|'CATEGORY';
  serviceId?:string|null;categoryId?:string|null;quantity:string
}>;
async function audit(tx:any,ctx:CustomerRightActor,action:string,entity:string,
 entityId:string,after:Record<string,unknown>){
  await tx.auditLog.create({data:{
    tenantId:ctx.tenantId,userId:requireActor(ctx),action,entity,entityId,
    after,ipAddress:ctx.ip||null,userAgent:ctx.userAgent||null
  }});
}
export async function createBenefit(ctx:CustomerRightActor,input:BenefitCreate){
  const actorId=requireActor(ctx);
  return prisma.$transaction(async tx=>{
    const product=await tx.product.findFirst({
      where:{tenantId:ctx.tenantId,id:input.productId,active:true},select:{id:true}
    });
    if(!product)denied(422,'Producto ajeno o inactivo.','BENEFIT_PRODUCT_INVALID');
    if(input.scope==='SERVICE'){
      const service=await tx.serviceDefinition.findFirst({
        where:{tenantId:ctx.tenantId,id:input.serviceId!,status:'active'},
        select:{id:true}
      });
      if(!service)denied(422,'Servicio ajeno o inactivo.','BENEFIT_SERVICE_INVALID');
    }else if(input.scope==='CATEGORY'){
      const category=await tx.serviceCatalogCategory.findFirst({
        where:{tenantId:ctx.tenantId,id:input.categoryId!,status:'active'},select:{id:true}
      });
      if(!category)denied(422,'Categoría ajena o inactiva.','BENEFIT_CATEGORY_INVALID');
    }
    const created=await tx.benefitDefinition.create({data:{
      id:randomUUID(),tenantId:ctx.tenantId,productId:product.id,name:input.name,
      scope:input.scope,serviceId:input.serviceId||null,categoryId:input.categoryId||null,
      quantity:input.quantity,status:'active',version:1,createdBy:actorId
    }});
    await audit(tx,ctx,'benefit.created','BenefitDefinition',created.id,{
      productId:created.productId,scope:created.scope,version:created.version
    });
    return created;
  });
}
export type ManualGrant=Readonly<{
  benefitId:string;beneficiaryId:string;effectKey:string;reason:string;
  validFrom:Date;validUntil:Date;locationId?:string|null
}>;
export async function grantCustomerRight(ctx:CustomerRightActor,input:ManualGrant){
  const actorId=requireActor(ctx);
  if(input.validFrom.getTime()>=input.validUntil.getTime())
    denied(422,'El período del derecho es inválido.','ENTITLEMENT_WINDOW_INVALID');
  return prisma.$transaction(async tx=>{
    // Two grants with the same effect must serialize even when they start
    // before either transaction inserts its unique index entry. The unique
    // constraint remains the final guard for writers outside this service.
    const effectLock=`cg:entitlement-grant:v1:${ctx.tenantId}:${input.effectKey}`;
    await tx.$queryRaw<Array<{locked:string|null}>>`
      SELECT pg_advisory_xact_lock(hashtextextended(${effectLock},0))::text AS locked
    `;
    // Idempotent replay is tenant-wide for the effect key. Replays may not
    // silently change beneficiary/benefit/time window or grant twice.
    const prior=await tx.customerEntitlement.findFirst({
      where:{tenantId:ctx.tenantId,sourceType:'manual',sourceId:input.effectKey}
    });
    if(prior){
      const first=await tx.entitlementLedgerEvent.findFirst({
        where:{tenantId:ctx.tenantId,entitlementId:prior.id,sequence:1,type:'GRANT'},
        select:{reason:true}
      });
      const identical=first?.reason===input.reason&&
        prior.beneficiaryId===input.beneficiaryId&&prior.benefitId===input.benefitId
        &&prior.validFrom.getTime()===input.validFrom.getTime()
        &&prior.validUntil.getTime()===input.validUntil.getTime()
        &&prior.locationId===(input.locationId||null);
      if(!identical)denied(409,'Clave de efecto usada con parámetros distintos.','ENTITLEMENT_EFFECT_CONFLICT');
      return {entitlement:prior,replayed:true};
    }
    const [benefit,beneficiary]=await Promise.all([
      tx.benefitDefinition.findFirst({
        where:{tenantId:ctx.tenantId,id:input.benefitId,status:'active'},
        select:{id:true,productId:true,name:true,scope:true,serviceId:true,categoryId:true,
          quantity:true,version:true}
      }),
      tx.client.findFirst({where:{tenantId:ctx.tenantId,id:input.beneficiaryId,active:true},select:{id:true}})
    ]);
    if(!benefit||!beneficiary)
      denied(422,'Beneficio o beneficiario no disponible en la empresa.','ENTITLEMENT_REFERENCE_INVALID');
    if(input.locationId){
      const location=await tx.businessLocation.findFirst({
        where:{tenantId:ctx.tenantId,id:input.locationId,status:'active'},select:{id:true}
      });
      if(!location)denied(422,'Sede no disponible en la empresa.','ENTITLEMENT_LOCATION_INVALID');
    }
    const quantity=benefit.quantity.toFixed(3);
    const snapshot={productId:benefit.productId,benefitId:benefit.id,
      benefitVersion:benefit.version,scope:benefit.scope,
      scopeId:benefit.scope==='SERVICE'?benefit.serviceId:
        benefit.scope==='CATEGORY'?benefit.categoryId:null,
      quantity,sourceType:'manual'};
    const entitlement=await tx.customerEntitlement.create({data:{
      id:randomUUID(),tenantId:ctx.tenantId,benefitId:benefit.id,
      beneficiaryId:beneficiary.id,sourceType:'manual',sourceId:input.effectKey,
      snapshot,grantedQuantity:quantity,validFrom:input.validFrom,
      validUntil:input.validUntil,locationId:input.locationId||null,
      priority:0,grantedBy:actorId
    }});
    await tx.entitlementLedgerEvent.create({data:{
      id:randomUUID(),tenantId:ctx.tenantId,entitlementId:entitlement.id,
      sequence:1,type:'GRANT',quantity,effectKey:input.effectKey,
      actorId,reason:input.reason
    }});
    await audit(tx,ctx,'entitlement.manual-grant','CustomerEntitlement',entitlement.id,{
      benefitId:benefit.id,beneficiaryId:beneficiary.id,sourceType:'manual',
      quantity,validFrom:input.validFrom.toISOString(),validUntil:input.validUntil.toISOString()
    });
    return {entitlement,replayed:false};
  });
}
export async function readCustomerRights(ctx:CustomerRightActor,clientId:string){
  const client=await prisma.client.findFirst({where:{tenantId:ctx.tenantId,id:clientId},select:{id:true}});
  if(!client)denied(404,'Beneficiario no encontrado.','ENTITLEMENT_BENEFICIARY_NOT_FOUND');
  const rows=await prisma.customerEntitlement.findMany({
    where:{tenantId:ctx.tenantId,beneficiaryId:clientId},
    include:{events:{orderBy:{sequence:'asc'}}},
    orderBy:[{validUntil:'asc'},{id:'asc'}],take:100
  });
  return rows.map(row=>{
    const projected=projectEntitlementLedger({
      tenantId:ctx.tenantId,entitlementId:row.id,beneficiaryId:clientId,
      events:row.events.map(event=>({
        id:event.id,tenantId:event.tenantId,entitlementId:event.entitlementId,
        beneficiaryId:clientId,sequence:event.sequence,type:event.type,
        quantity:event.quantity.toFixed(3),effectKey:event.effectKey
      }))
    });
    return Object.freeze({
      id:row.id,benefitId:row.benefitId,sourceType:row.sourceType,
      snapshot:row.snapshot,validFrom:row.validFrom,validUntil:row.validUntil,
      locationId:row.locationId,granted:projected.granted,
      remaining:projected.remaining,readOnly:true
    });
  });
}

/**
 * #852 Private domain seam for an existing booking write transaction.
 * MUST be invoked within the very same tx that inserts the booking and
 * SchedulingResourceAllocation claims. Not exposed as an HTTP endpoint.
 *
 * A booking without a verified client association cannot consume a right.
 * This deliberately excludes GymMember/clinical bookings until their adapters
 * preserve beneficiary identity and resource-capacity authority.
 */
export async function consumeCustomerRightInBookingTransaction(
  tx:Prisma.TransactionClient,
  ctx:CustomerRightActor,
  input:Readonly<{
    entitlementId:string;bookingId:string;serviceId?:string|null;
    effectKey:string;quantity:string
  }>
){
  if(!tx||tx===prisma)denied(500,'Se requiere una transacción de booking.','ENTITLEMENT_TRANSACTION_REQUIRED');
  const actorId=requireActor(ctx);
  const quantity=/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,3})?$/.test(input.quantity)?
    input.quantity:null;
  if(!quantity||!/[1-9]/.test(quantity)||!(/^[A-Za-z0-9:_-]{8,128}$/).test(input.effectKey))
    denied(422,'Cantidad o clave de consumo inválidas.','ENTITLEMENT_CONSUME_INPUT_INVALID');
  // Every consumer must use the tenant+entitlement transaction-scoped mutex,
  // not SELECT FOR UPDATE (history runtime DB role is read+insert only).
  const mutex=`cg:entitlement-consume:v1:${ctx.tenantId}:${input.entitlementId}`;
  await tx.$queryRaw<Array<{locked:string|null}>>`
    SELECT pg_advisory_xact_lock(hashtextextended(${mutex},0))::text AS locked
  `;
  const right=await tx.customerEntitlement.findFirst({
    where:{tenantId:ctx.tenantId,id:input.entitlementId}
  });
  if(!right)denied(404,'Derecho no encontrado.','ENTITLEMENT_NOT_FOUND');
  // A concurrent cancellation/status update must not invalidate the booking
  // between eligibility and the committed CONSUME event.
  const bookingLocks=await tx.$queryRaw<Array<{id:string}>>`
    SELECT "id" FROM public."SchedulingBooking"
    WHERE "tenantId"=${ctx.tenantId} AND "id"=${input.bookingId}
      AND "status"='confirmed' AND "sourceType"='client'
      AND "sourceId"=${right.beneficiaryId}
    FOR SHARE
  `;
  if(bookingLocks.length!==1)
    denied(409,'Reserva sin identidad de beneficiario verificada.','ENTITLEMENT_BOOKING_NOT_AUTHORIZED');
  const booking=await tx.schedulingBooking.findFirst({
    where:{id:input.bookingId,tenantId:ctx.tenantId,status:'confirmed',
      sourceType:'client',sourceId:right.beneficiaryId},
    select:{id:true,locationId:true,startsAtUtc:true,status:true}
  });
  if(!booking)denied(409,'Reserva sin identidad de beneficiario verificada.','ENTITLEMENT_BOOKING_NOT_AUTHORIZED');
  // Protect active resource ownership from a concurrent release as well.
  // FOR SHARE conflicts with updates that would change status to released.
  const allocationLocks=await tx.$queryRaw<Array<{id:string}>>`
    SELECT "id" FROM public."SchedulingResourceAllocation"
    WHERE "tenantId"=${ctx.tenantId} AND "bookingId"=${booking.id}
      AND "locationId"=${booking.locationId} AND "status"='active'
    ORDER BY "id" FOR SHARE
  `;
  if(allocationLocks.length===0)
    denied(409,'La reserva no tiene recurso autorizado.','ENTITLEMENT_RESOURCE_NOT_RESERVED');
  const allocation=await tx.schedulingResourceAllocation.findFirst({
    where:{tenantId:ctx.tenantId,bookingId:booking.id,locationId:booking.locationId,status:'active'},
    select:{id:true}
  });
  if(!allocation)denied(409,'La reserva no tiene recurso autorizado.','ENTITLEMENT_RESOURCE_NOT_RESERVED');
  if(booking.startsAtUtc<right.validFrom||booking.startsAtUtc>=right.validUntil||
    (right.locationId&&right.locationId!==booking.locationId))
    denied(409,'Derecho fuera de vigencia o sede.','ENTITLEMENT_NOT_ELIGIBLE');
  const snap=right.snapshot;
  if(!snap||typeof snap!=='object'||Array.isArray(snap))
    denied(409,'Snapshot de derecho no disponible.','ENTITLEMENT_SNAPSHOT_INVALID');
  const scope=(snap as Record<string,unknown>).scope;
  const scopeId=(snap as Record<string,unknown>).scopeId;
  if(scope==='SERVICE'){
    if(!input.serviceId||scopeId!==input.serviceId)
      denied(409,'Servicio fuera del alcance del derecho.','ENTITLEMENT_SCOPE_MISMATCH');
  }else if(scope==='CATEGORY'){
    if(!input.serviceId)denied(409,'Falta servicio asociado.','ENTITLEMENT_SCOPE_MISMATCH');
    const service=await tx.serviceDefinition.findFirst({
      where:{tenantId:ctx.tenantId,id:input.serviceId,categoryId:String(scopeId)},
      select:{id:true}
    });
    if(!service)denied(409,'Categoría fuera del alcance del derecho.','ENTITLEMENT_SCOPE_MISMATCH');
  }else if(scope!=='ALL'){
    denied(409,'Alcance de derecho no reconocido.','ENTITLEMENT_SCOPE_MISMATCH');
  }
  const existing=await tx.entitlementLedgerEvent.findFirst({
    where:{tenantId:ctx.tenantId,effectKey:input.effectKey}
  });
  if(existing){
    if(existing.entitlementId!==right.id||existing.type!=='CONSUME'||
      existing.bookingId!==booking.id||existing.quantity.toFixed(3)!==(
        quantity.includes('.')?quantity.split('.')[0]+'.'+quantity.split('.')[1].padEnd(3,'0'):quantity+'.000'))
      denied(409,'Reintento incompatible con el consumo anterior.','ENTITLEMENT_EFFECT_CONFLICT');
    return {event:existing,replayed:true};
  }
  const events=await tx.entitlementLedgerEvent.findMany({
    where:{tenantId:ctx.tenantId,entitlementId:right.id},orderBy:{sequence:'asc'},take:10001
  });
  if(events.length>10000)denied(409,'Historial supera el límite autorizado.','ENTITLEMENT_LEDGER_LIMIT');
  let projected:ReturnType<typeof projectEntitlementLedger>;
  try{
    projected=projectEntitlementLedger({
      tenantId:ctx.tenantId,entitlementId:right.id,beneficiaryId:right.beneficiaryId,
      events:events.map(event=>({
        id:event.id,tenantId:event.tenantId,entitlementId:event.entitlementId,
        beneficiaryId:right.beneficiaryId,sequence:event.sequence,type:event.type,
        quantity:event.quantity.toFixed(3),effectKey:event.effectKey
      }))
    });
  }catch{
    denied(409,'Integridad del historial de derechos no verificable.','ENTITLEMENT_LEDGER_DRIFT');
  }
  function milli(value:string){
    const [w,f='']=value.split('.');
    return BigInt(w)*1000n+BigInt(f.padEnd(3,'0')||'0');
  }
  if(milli(quantity)>milli(projected.remaining))
    denied(409,'Derecho insuficiente.','ENTITLEMENT_INSUFFICIENT');
  const event=await tx.entitlementLedgerEvent.create({data:{
    id:randomUUID(),tenantId:ctx.tenantId,entitlementId:right.id,
    sequence:projected.lastSequence+1,type:'CONSUME',quantity:quantity,
    effectKey:input.effectKey,bookingId:booking.id,actorId,reason:'booking-consume'
  }});
  await audit(tx,ctx,'entitlement.booking-consume','CustomerEntitlement',right.id,{
    eventId:event.id,bookingId:booking.id,sequence:event.sequence,
    quantity:event.quantity.toFixed(3)
  });
  return {event,replayed:false};
}
