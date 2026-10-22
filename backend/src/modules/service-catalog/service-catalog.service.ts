import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { buildServiceStepPlan } from './service-step-plan.policy.js';

export type CatalogActor = Readonly<{
  tenantId:string; userId?:string; ip?:string; userAgent?:string
}>;
export type CatalogServiceDraft = Readonly<{
  name:string; description?:string|null; categoryId?:string|null; productId?:string|null;
  modality:'onsite'|'remote'|'hybrid'; durationMinutes:number
}>;
export type CatalogStepDraft = Readonly<{
  id?:string; position:number; label:string; durationMinutes:number; gapAfterMinutes:number
}>;

function actor(ctx:CatalogActor){
  const id=String(ctx.userId||'').trim();
  if(!id)throw new HttpError(401,'Operación de catálogo requiere actor autenticado.');
  return id;
}
function denied(code:string,reason:string,status=409):never{
  throw new HttpError(status,reason,{code});
}
async function audit(tx:Prisma.TransactionClient,ctx:CatalogActor,action:string,entityId:string,after:Record<string,unknown>){
  await tx.auditLog.create({data:{
    tenantId:ctx.tenantId,userId:actor(ctx),action,entity:'ServiceDefinition',entityId,
    after,ipAddress:ctx.ip||null,userAgent:ctx.userAgent||null
  }});
}
async function ownedService(tx:Prisma.TransactionClient,tenantId:string,id:string){
  const service=await tx.serviceDefinition.findFirst({where:{tenantId,id}});
  if(!service)denied('SERVICE_NOT_FOUND','Servicio no encontrado.',404);
  return service;
}
async function lockService(tx:Prisma.TransactionClient,tenantId:string,id:string){
  const rows=await tx.$queryRaw<Array<{id:string}>>`
    SELECT "id" FROM public."ServiceDefinition"
    WHERE "tenantId"=${tenantId} AND "id"=${id} FOR UPDATE
  `;
  if(rows.length!==1)denied('SERVICE_NOT_FOUND','Servicio no encontrado.',404);
}
async function validateRefs(tx:Prisma.TransactionClient,tenantId:string,
 categoryId:string|null|undefined,productId:string|null|undefined){
  if(categoryId){
    const c=await tx.serviceCatalogCategory.findFirst({where:{tenantId,id:categoryId,status:'active'},select:{id:true}});
    if(!c)denied('SERVICE_CATEGORY_NOT_AVAILABLE','Categoría ajena, inexistente o archivada.',422);
  }
  if(productId){
    const p=await tx.product.findFirst({where:{tenantId,id:productId,active:true},select:{id:true}});
    if(!p)denied('SERVICE_PRODUCT_NOT_AVAILABLE','Producto ajeno, inexistente o inactivo.',422);
  }
}
async function snapshotRevision(tx:Prisma.TransactionClient,ctx:CatalogActor,
 service:{id:string;tenantId:string;version:number;name:string;description:string|null;
  categoryId:string|null;productId:string|null;modality:string;durationMinutes:number;
  status:string;visibility:string}){
  const steps=await tx.serviceStep.findMany({
    where:{tenantId:ctx.tenantId,serviceId:service.id},orderBy:{position:'asc'},
    select:{id:true,position:true,label:true,durationMinutes:true,gapAfterMinutes:true}
  });
  const snapshot={name:service.name,description:service.description,categoryId:service.categoryId,
    productId:service.productId,modality:service.modality,durationMinutes:service.durationMinutes,
    status:service.status,visibility:service.visibility,steps};
  await tx.serviceDefinitionRevision.create({data:{
    tenantId:ctx.tenantId,serviceId:service.id,version:service.version,
    snapshot,createdBy:actor(ctx)
  }});
}
export async function createServiceCategory(ctx:CatalogActor,input:{
 slug:string;name:string;displayOrder:number
}){
  return prisma.$transaction(async tx=>{
    const id=randomUUID();
    try{
      const row=await tx.serviceCatalogCategory.create({data:{
        id,tenantId:ctx.tenantId,slug:input.slug,name:input.name,
        displayOrder:input.displayOrder
      }});
      await audit(tx,ctx,'service-category.created',id,{slug:row.slug});
      return row;
    }catch(e:any){
      if(e?.code==='P2002')denied('CATEGORY_SLUG_CONFLICT','La categoría ya existe.',409);
      throw e;
    }
  });
}
export async function createCatalogService(ctx:CatalogActor,input:CatalogServiceDraft){
  return prisma.$transaction(async tx=>{
    await validateRefs(tx,ctx.tenantId,input.categoryId,input.productId);
    const created=await tx.serviceDefinition.create({data:{
      id:randomUUID(),tenantId:ctx.tenantId,name:input.name,
      description:input.description??null,categoryId:input.categoryId??null,
      productId:input.productId??null,modality:input.modality,durationMinutes:input.durationMinutes,
      status:'draft',visibility:'internal',version:1,createdBy:actor(ctx)
    }});
    await snapshotRevision(tx,ctx,created);
    await audit(tx,ctx,'service.created',created.id,{version:1,productId:created.productId});
    return created;
  });
}
export async function replaceServiceSteps(ctx:CatalogActor,serviceId:string,
 expectedVersion:number,input:readonly CatalogStepDraft[]){
  if(!input.length)denied('SERVICE_STEP_PLAN_EMPTY','El servicio requiere al menos una etapa.',422);
  let plan:ReturnType<typeof buildServiceStepPlan>;
  try{
    plan=buildServiceStepPlan({tenantId:ctx.tenantId,serviceId,version:expectedVersion+1,
      steps:input.map(row=>({...row,tenantId:ctx.tenantId,serviceId,id:row.id||randomUUID()}))});
  }catch{
    denied('SERVICE_STEP_PLAN_INVALID','Plan de etapas inválido.',422);
  }
  return prisma.$transaction(async tx=>{
    await lockService(tx,ctx.tenantId,serviceId);
    const before=await ownedService(tx,ctx.tenantId,serviceId);
    if(before.version!==expectedVersion||before.status==='archived')
      denied('SERVICE_VERSION_CONFLICT','Versión obsoleta o servicio archivado.');
    // Rewrites current plan atomically; immutable revision snapshots preserve history.
    await tx.serviceStep.deleteMany({where:{tenantId:ctx.tenantId,serviceId}});
    await tx.serviceStep.createMany({data:plan.steps.map(row=>({
      id:row.id,tenantId:ctx.tenantId,serviceId,
      position:row.position,label:row.label,
      durationMinutes:row.durationMinutes,gapAfterMinutes:row.gapAfterMinutes
    }))});
    const updated=await tx.serviceDefinition.update({
      where:{id:serviceId,tenantId:ctx.tenantId},
      data:{durationMinutes:plan.totalMinutes,version:{increment:1},updatedBy:actor(ctx)}
    });
    await snapshotRevision(tx,ctx,updated);
    await audit(tx,ctx,'service.steps-replaced',serviceId,
      {fromVersion:before.version,toVersion:updated.version,stepCount:plan.steps.length});
    return {serviceId,version:updated.version,totalMinutes:plan.totalMinutes,steps:plan.steps};
  });
}
export async function assignServiceStaff(ctx:CatalogActor,serviceId:string,
 employeeId:string,enabled:boolean){
  return prisma.$transaction(async tx=>{
    await lockService(tx,ctx.tenantId,serviceId);
    const service=await ownedService(tx,ctx.tenantId,serviceId);
    if(service.status==='archived')denied('SERVICE_ARCHIVED','Servicio archivado.');
    const employee=await tx.employee.findFirst({where:{tenantId:ctx.tenantId,id:employeeId,active:true},select:{id:true}});
    if(!employee)denied('SERVICE_STAFF_NOT_FOUND','Profesional no disponible en la empresa.',422);
    const exists=await tx.serviceStaffCapability.findFirst({where:{tenantId:ctx.tenantId,serviceId,employeeId},select:{id:true}});
    if(enabled&&!exists){
      await tx.serviceStaffCapability.create({data:{
        tenantId:ctx.tenantId,serviceId,employeeId,createdBy:actor(ctx)
      }});
    }else if(!enabled&&exists){
      await tx.serviceStaffCapability.deleteMany({where:{tenantId:ctx.tenantId,serviceId,employeeId}});
    }
    if(Boolean(exists)!==enabled)
      await audit(tx,ctx,'service.staff-assignment',serviceId,{employeeId,enabled});
    return {serviceId,employeeId,enabled,changed:Boolean(exists)!==enabled};
  });
}
export async function assignServiceLocation(ctx:CatalogActor,serviceId:string,
 locationId:string,enabled:boolean){
  return prisma.$transaction(async tx=>{
    await lockService(tx,ctx.tenantId,serviceId);
    const service=await ownedService(tx,ctx.tenantId,serviceId);
    if(service.status==='archived')denied('SERVICE_ARCHIVED','Servicio archivado.');
    const location=await tx.businessLocation.findFirst({where:{tenantId:ctx.tenantId,id:locationId,status:'active'},select:{id:true}});
    if(!location)denied('SERVICE_LOCATION_NOT_FOUND','Sede no disponible en la empresa.',422);
    const exists=await tx.serviceLocationEligibility.findFirst({where:{tenantId:ctx.tenantId,serviceId,locationId},select:{id:true}});
    if(enabled&&!exists){
      await tx.serviceLocationEligibility.create({data:{
        tenantId:ctx.tenantId,serviceId,locationId,createdBy:actor(ctx)
      }});
    }else if(!enabled&&exists){
      await tx.serviceLocationEligibility.deleteMany({where:{tenantId:ctx.tenantId,serviceId,locationId}});
    }
    if(Boolean(exists)!==enabled)
      await audit(tx,ctx,'service.location-assignment',serviceId,{locationId,enabled});
    return {serviceId,locationId,enabled,changed:Boolean(exists)!==enabled};
  });
}
export async function setServiceStatus(ctx:CatalogActor,serviceId:string,
 expectedVersion:number,status:'active'|'archived',visibility:'public'|'internal'){
  return prisma.$transaction(async tx=>{
    await lockService(tx,ctx.tenantId,serviceId);
    const before=await ownedService(tx,ctx.tenantId,serviceId);
    if(before.version!==expectedVersion||before.status==='archived')
      denied('SERVICE_VERSION_CONFLICT','Versión obsoleta o servicio archivado.');
    if(status==='active'){
      const [steps,places]=await Promise.all([
        tx.serviceStep.count({where:{tenantId:ctx.tenantId,serviceId}}),
        tx.serviceLocationEligibility.count({where:{tenantId:ctx.tenantId,serviceId}})
      ]);
      if(steps<1|| (before.modality!=='remote'&&places<1))
        denied('SERVICE_PUBLICATION_NOT_READY','Faltan etapas o sedes elegibles.',422);
      await validateRefs(tx,ctx.tenantId,before.categoryId,before.productId);
      if(visibility==='public'&&!before.productId)
        denied('SERVICE_PRICE_REFERENCE_REQUIRED','Oferta pública requiere referencia a Product.',422);
    }
    const updated=await tx.serviceDefinition.update({
      where:{tenantId:ctx.tenantId,id:serviceId},
      data:{status,visibility:status==='archived'?'internal':visibility,
        version:{increment:1},updatedBy:actor(ctx)}
    });
    await snapshotRevision(tx,ctx,updated);
    await audit(tx,ctx,'service.status',serviceId,{fromVersion:before.version,
      toVersion:updated.version,status:updated.status,visibility:updated.visibility});
    return updated;
  });
}
