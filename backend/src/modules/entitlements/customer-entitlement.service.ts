import { randomUUID } from 'node:crypto';
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
    // Idempotent replay is tenant-wide for the effect key. Replays may not
    // silently change beneficiary/benefit/time window or grant twice.
    const prior=await tx.customerEntitlement.findFirst({
      where:{tenantId:ctx.tenantId,sourceType:'manual',sourceId:input.effectKey}
    });
    if(prior){
      const identical=prior.beneficiaryId===input.beneficiaryId&&prior.benefitId===input.benefitId
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
