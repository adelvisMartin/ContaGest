import {Router} from 'express';
import {z} from 'zod';
import {prisma} from '../../database/prisma.js';
import {asyncHandler,HttpError,ok} from '../../shared/http.js';
import {requirePermission,requireTenant} from '../../shared/middleware/context.js';
import {writeAudit} from '../../shared/services/audit.service.js';

const router=Router();
router.use(requireTenant,requirePermission('admin.manage'));
const updateSchema=z.object({
  name:z.string().trim().min(2).max(180).optional(),
  legalName:z.string().trim().max(220).nullable().optional(),
  settings:z.record(z.string(),z.unknown()).optional()
}).strict();

function assertCurrentTenant(req:any,id:string){
  if(req.context?.tenantId!==id)throw new HttpError(403,'Solo puedes administrar la empresa activa. El acceso global a tenants pertenece a la consola de plataforma.');
}

router.get('/',asyncHandler(async(req,res)=>{
  const ctx=(req as any).context;
  const data=await prisma.tenant.findUnique({where:{id:ctx.tenantId}});
  if(!data)throw new HttpError(404,'Empresa no encontrada.');
  ok(res,[data]);
}));

router.get('/:id',asyncHandler(async(req,res)=>{
  assertCurrentTenant(req,req.params.id);
  const data=await prisma.tenant.findUnique({where:{id:req.params.id}});
  if(!data)throw new HttpError(404,'Empresa no encontrada.');
  ok(res,data);
}));

router.put('/:id',asyncHandler(async(req,res)=>{
  assertCurrentTenant(req,req.params.id);
  if(Object.prototype.hasOwnProperty.call(req.body||{},'rif'))throw new HttpError(409,'El RIF queda bloqueado después del registro. Solicita una corrección fiscal controlada al soporte de plataforma.');
  if(Object.prototype.hasOwnProperty.call(req.body||{},'plan')||Object.prototype.hasOwnProperty.call(req.body||{},'status'))throw new HttpError(403,'Plan y estado comercial no son campos autoadministrables por el tenant.');
  const body=updateSchema.parse(req.body||{});
  const ctx=(req as any).context;
  const before=await prisma.tenant.findUnique({where:{id:req.params.id}});
  if(!before)throw new HttpError(404,'Empresa no encontrada.');
  const mutableData={
    ...(body.name!==undefined?{name:body.name}:{}),
    ...(body.legalName!==undefined?{legalName:body.legalName}:{}),
    ...(body.settings!==undefined?{settings:body.settings as any}:{})
  };
  const data=await prisma.tenant.update({where:{id:req.params.id},data:mutableData});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'tenant.update.safe',entity:'tenant',entityId:data.id,before,after:data,ipAddress:ctx.ip,userAgent:ctx.userAgent});
  ok(res,data);
}));

router.post('/',(_req,_res,next)=>next(new HttpError(405,'El alta de empresas se realiza por registro/autorización comercial, no por el CRUD del tenant.')));
router.delete('/:id',(_req,_res,next)=>next(new HttpError(405,'Una empresa no se elimina desde configuración. Usa el procedimiento de cierre y retención de servicio.')));
export default router;
