import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { projectPublicServiceCatalog } from './service-public-projection.mjs';
import {
  createServiceCategory,createCatalogService,replaceServiceSteps,
  assignServiceStaff,assignServiceLocation,setServiceStatus
} from './service-catalog.service.js';

const router=Router();
router.use(requireTenant);
// Until public tenant resolution is implemented, all routes (including the
// "public projection") require a session with admin permission. No anonymous
// request can set tenantId or view another tenant's private catalog.
router.use(requirePermission('admin.manage'));
const ctx=(req:any)=>req.context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
const uuid=z.string().uuid();
const category=z.object({
  slug:z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  name:z.string().trim().min(1).max(160),
  displayOrder:z.number().int().min(-10000).max(10000).default(0)
}).strict();
const service=z.object({
  name:z.string().trim().min(1).max(160),
  description:z.string().max(600).nullish(),
  categoryId:uuid.nullish(),productId:uuid.nullish(),
  modality:z.enum(['onsite','remote','hybrid']).default('onsite'),
  durationMinutes:z.number().int().min(1).max(2880)
}).strict();
const step=z.object({
  id:uuid.optional(),position:z.number().int().min(1).max(24),
  label:z.string().trim().min(1).max(120),
  durationMinutes:z.number().int().min(1).max(480),
  gapAfterMinutes:z.number().int().min(0).max(180).default(0)
}).strict();
const steps=z.object({expectedVersion:z.number().int().min(1),
  steps:z.array(step).min(1).max(24)}).strict();
const status=z.object({
  expectedVersion:z.number().int().min(1),
  status:z.enum(['active','archived']),
  visibility:z.enum(['internal','public']).default('internal')
}).strict();
const listQuery=z.object({
  take:z.coerce.number().int().min(1).max(100).default(50),
  skip:z.coerce.number().int().min(0).max(100000).default(0)
}).strict();
function params(req:any){
  const parsed=uuid.safeParse(req.params.id);
  if(!parsed.success)throw new HttpError(422,'Identificador de servicio inválido.');
  return parsed.data;
}
function assignment(req:any,key:'employeeId'|'locationId'){
  const parsed=uuid.safeParse(req.params[key]);
  if(!parsed.success)throw new HttpError(422,'Identificador de referencia inválido.');
  return parsed.data;
}

router.get('/categories',asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId;
  ok(res,await prisma.serviceCatalogCategory.findMany({
    where:{tenantId},orderBy:[{displayOrder:'asc'},{name:'asc'}],take:100
  }));
}));
router.post('/categories',validateBody(category),asyncHandler(async(req,res)=>{
  ok(res,await createServiceCategory(ctx(req),req.body),201);
}));
router.get('/public',asyncHandler(async(req,res)=>{
  const pagination=listQuery.parse(req.query);
  const tenantId=ctx(req).tenantId;
  const rows=await prisma.serviceDefinition.findMany({
    where:{tenantId,status:'active',visibility:'public'},
    select:{id:true,tenantId:true,categoryId:true,name:true,description:true,status:true,
      visibility:true,version:true,modality:true,durationMinutes:true},
    orderBy:[{name:'asc'},{id:'asc'}],take:pagination.take,skip:pagination.skip
  });
  res.setHeader('Cache-Control','private, no-store');
  ok(res,projectPublicServiceCatalog({tenantId,rows}));
}));
router.get('/services',asyncHandler(async(req,res)=>{
  const {take,skip}=listQuery.parse(req.query);
  ok(res,await prisma.serviceDefinition.findMany({
    where:{tenantId:ctx(req).tenantId},
    orderBy:[{name:'asc'},{id:'asc'}],take,skip
  }));
}));
router.post('/services',validateBody(service),asyncHandler(async(req,res)=>{
  ok(res,await createCatalogService(ctx(req),req.body),201);
}));
router.get('/services/:id',asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId,id=params(req);
  const found=await prisma.serviceDefinition.findFirst({
    where:{tenantId,id},include:{
      steps:{orderBy:{position:'asc'}},
      staff:{select:{employeeId:true}},locations:{select:{locationId:true}},
      revisions:{orderBy:{version:'desc'},take:1}
    }
  });
  if(!found)throw new HttpError(404,'Servicio no encontrado.');
  ok(res,found);
}));
router.put('/services/:id/steps',validateBody(steps),asyncHandler(async(req,res)=>{
  ok(res,await replaceServiceSteps(ctx(req),params(req),req.body.expectedVersion,req.body.steps));
}));
router.patch('/services/:id/status',validateBody(status),asyncHandler(async(req,res)=>{
  ok(res,await setServiceStatus(ctx(req),params(req),
    req.body.expectedVersion,req.body.status,req.body.visibility));
}));
router.put('/services/:id/staff/:employeeId',asyncHandler(async(req,res)=>{
  ok(res,await assignServiceStaff(ctx(req),params(req),assignment(req,'employeeId'),true));
}));
router.delete('/services/:id/staff/:employeeId',asyncHandler(async(req,res)=>{
  ok(res,await assignServiceStaff(ctx(req),params(req),assignment(req,'employeeId'),false));
}));
router.put('/services/:id/locations/:locationId',asyncHandler(async(req,res)=>{
  ok(res,await assignServiceLocation(ctx(req),params(req),assignment(req,'locationId'),true));
}));
router.delete('/services/:id/locations/:locationId',asyncHandler(async(req,res)=>{
  ok(res,await assignServiceLocation(ctx(req),params(req),assignment(req,'locationId'),false));
}));
// The staff-side and service-side read from the same relational assignment.
router.get('/staff/:employeeId/services',asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId,employeeId=assignment(req,'employeeId');
  const staff=await prisma.employee.findFirst({where:{tenantId,id:employeeId},
    select:{id:true}});
  if(!staff)throw new HttpError(404,'Profesional no encontrado.');
  ok(res,await prisma.serviceStaffCapability.findMany({
    where:{tenantId,employeeId},select:{serviceId:true},orderBy:{serviceId:'asc'}
  }));
}));

export default router;
