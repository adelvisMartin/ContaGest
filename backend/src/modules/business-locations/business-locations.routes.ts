import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { assertIanaTimezone, normalizeBusinessLocationCode, normalizeOptionalContact } from './business-location.policy.js';

const router=Router();
const context=(req:any)=>req.context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
const createSchema=z.object({
  code:z.string().min(1).max(32),
  name:z.string().trim().min(1).max(160),
  timezone:z.string().trim().min(1).max(100),
  addressGeocodeId:z.string().uuid().optional().nullable(),
  phone:z.string().max(80).optional().nullable(),
  email:z.string().email().max(160).optional().nullable()
}).strict();
const updateSchema=z.object({
  name:z.string().trim().min(1).max(160).optional(),
  timezone:z.string().trim().min(1).max(100).optional(),
  addressGeocodeId:z.string().uuid().optional().nullable(),
  phone:z.string().max(80).optional().nullable(),
  email:z.string().email().max(160).optional().nullable(),
  confirmTimezoneChange:z.boolean().optional()
}).strict();
const listStatuses=new Set(['active','inactive','closed']);

router.use(requireTenant);

async function ensureAddressTenant(tenantId:string,addressGeocodeId:string|null|undefined){
  if(!addressGeocodeId) return null;
  const address=await prisma.addressGeocode.findFirst({where:{id:addressGeocodeId,tenantId},select:{id:true}});
  if(!address) throw new HttpError(400,'La dirección no pertenece al tenant activo.',{code:'BUSINESS_LOCATION_ADDRESS_TENANT_MISMATCH'});
  return address.id;
}
async function getOwned(tenantId:string,id:string){
  const location=await prisma.businessLocation.findFirst({where:{id,tenantId}});
  if(!location) throw new HttpError(404,'Sede no encontrada.',{code:'BUSINESS_LOCATION_NOT_FOUND'});
  return location;
}
async function audit(req:any,action:string,before:any,after:any){
  const ctx=context(req);
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action,entity:'BusinessLocation',entityId:after?.id||before?.id,before,after,ipAddress:ctx.ip,userAgent:ctx.userAgent});
}

router.get('/',asyncHandler(async(req,res)=>{
  const ctx=context(req);
  const status=typeof req.query.status==='string'?req.query.status:undefined;
  if(status && !listStatuses.has(status)) throw new HttpError(400,'Estado de sede inválido.',{code:'BUSINESS_LOCATION_STATUS_INVALID'});
  const search=typeof req.query.search==='string'?req.query.search.trim():'';
  const locations=await prisma.businessLocation.findMany({
    where:{tenantId:ctx.tenantId,...(status?{status}:{}),...(search?{OR:[{code:{contains:search,mode:'insensitive'}},{name:{contains:search,mode:'insensitive'}}]}:{})},
    orderBy:[{status:'asc'},{name:'asc'}]
  });
  ok(res,locations);
}));

router.get('/:id',asyncHandler(async(req,res)=>ok(res,await getOwned(context(req).tenantId,req.params.id))));

router.post('/',requirePermission('admin.manage'),validateBody(createSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req);
  const addressGeocodeId=await ensureAddressTenant(ctx.tenantId,req.body.addressGeocodeId);
  const data={tenantId:ctx.tenantId,code:normalizeBusinessLocationCode(req.body.code),name:req.body.name.trim(),status:'active',timezone:assertIanaTimezone(req.body.timezone),addressGeocodeId,phone:normalizeOptionalContact(req.body.phone,80),email:normalizeOptionalContact(req.body.email,160),createdBy:ctx.userId||null,updatedBy:ctx.userId||null};
  try {
    const created=await prisma.businessLocation.create({data});
    await audit(req,'business-location.created',null,created);
    ok(res,created,201);
  } catch(error:any) {
    if(error?.code==='P2002') throw new HttpError(409,'Ya existe una sede con ese código para el tenant.',{code:'BUSINESS_LOCATION_CODE_CONFLICT'});
    throw error;
  }
}));

router.patch('/:id',requirePermission('admin.manage'),validateBody(updateSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req); const before=await getOwned(ctx.tenantId,req.params.id);
  const timezone=req.body.timezone===undefined?undefined:assertIanaTimezone(req.body.timezone);
  if(timezone && timezone!==before.timezone && req.body.confirmTimezoneChange!==true) throw new HttpError(409,'Confirma explícitamente el cambio de zona horaria; afecta la interpretación de operaciones futuras.',{code:'BUSINESS_LOCATION_TIMEZONE_CONFIRMATION_REQUIRED'});
  const addressGeocodeId=req.body.addressGeocodeId===undefined?undefined:await ensureAddressTenant(ctx.tenantId,req.body.addressGeocodeId);
  const after=await prisma.businessLocation.update({where:{id:before.id},data:{...(req.body.name!==undefined?{name:req.body.name.trim()}:{}),...(timezone!==undefined?{timezone}:{}),...(addressGeocodeId!==undefined?{addressGeocodeId}:{}),...(req.body.phone!==undefined?{phone:normalizeOptionalContact(req.body.phone,80)}:{}),...(req.body.email!==undefined?{email:normalizeOptionalContact(req.body.email,160)}:{}),updatedBy:ctx.userId||null}});
  await audit(req,'business-location.updated',before,after); ok(res,after);
}));

async function transition(req:any,res:any,status:'active'|'inactive'|'closed',action:string){
  const ctx=context(req); const before=await getOwned(ctx.tenantId,req.params.id);
  const after=await prisma.businessLocation.update({where:{id:before.id},data:{status,updatedBy:ctx.userId||null}});
  await audit(req,action,before,after); ok(res,after);
}
router.post('/:id/deactivate',requirePermission('admin.manage'),asyncHandler(async(req,res)=>transition(req,res,'inactive','business-location.deactivated')));
router.post('/:id/close',requirePermission('admin.manage'),asyncHandler(async(req,res)=>transition(req,res,'closed','business-location.closed')));
router.post('/:id/reopen',requirePermission('admin.manage'),asyncHandler(async(req,res)=>transition(req,res,'active','business-location.reopened')));

export default router;
