import {Router} from 'express';
import {prisma} from '../../database/prisma.js';
import {asyncHandler,HttpError,ok} from '../../shared/http.js';
import {requirePermission,requireTenant} from '../../shared/middleware/context.js';

const router=Router();
router.use(requireTenant,requirePermission('admin.manage'));

type DeviceRow={
  id:string;
  licenseId:string;
  userId:string|null;
  deviceLabel:string|null;
  status:string;
  firstSeenAt:Date;
  lastSeenAt:Date;
  lastIp:string|null;
  lastUserAgent:string|null;
  credentialPreview:string|null;
  credentialIssuedAt:Date|null;
  credentialExpiresAt:Date|null;
  revokedAt:Date|null;
};

router.get('/:licenseId',asyncHandler(async(req,res)=>{
  const ctx=(req as any).context;
  const license=await prisma.licenseKey.findFirst({where:{id:req.params.licenseId,tenantId:ctx.tenantId},select:{id:true}});
  if(!license)throw new HttpError(404,'Licencia no encontrada en la empresa activa.');
  const rows=await prisma.$queryRaw<DeviceRow[]>`
    SELECT la."id",la."licenseId",la."userId",la."deviceLabel",la."status",la."firstSeenAt",la."lastSeenAt",
           la."lastIp",la."lastUserAgent",la."credentialPreview",la."credentialIssuedAt",la."credentialExpiresAt",la."revokedAt"
    FROM public."LicenseActivation" la
    WHERE la."licenseId"=${license.id} AND la."tenantId"=${ctx.tenantId}
    ORDER BY la."lastSeenAt" DESC
  `;
  ok(res,rows.map(row=>({
    ...row,
    firstSeenAt:new Date(row.firstSeenAt).toISOString(),
    lastSeenAt:new Date(row.lastSeenAt).toISOString(),
    credentialIssuedAt:row.credentialIssuedAt?new Date(row.credentialIssuedAt).toISOString():null,
    credentialExpiresAt:row.credentialExpiresAt?new Date(row.credentialExpiresAt).toISOString():null,
    revokedAt:row.revokedAt?new Date(row.revokedAt).toISOString():null
  })));
}));

router.patch('/:licenseId/:activationId/revoke',asyncHandler(async(req,res)=>{
  const ctx=(req as any).context;
  const rows=await prisma.$queryRaw<Array<{id:string}>>`
    SELECT la."id"
    FROM public."LicenseActivation" la
    JOIN public."LicenseKey" lk ON lk."id"=la."licenseId"
    WHERE la."id"=${req.params.activationId} AND la."licenseId"=${req.params.licenseId} AND lk."tenantId"=${ctx.tenantId}
    LIMIT 1
  `;
  if(!rows[0])throw new HttpError(404,'Activación no encontrada en la empresa activa.');
  await prisma.$executeRaw`
    UPDATE public."LicenseActivation"
    SET "status"='revoked',"revokedAt"=now(),"credentialHash"=NULL,"credentialExpiresAt"=now(),"lastSeenAt"=now()
    WHERE "id"=${req.params.activationId}
  `;
  await prisma.auditLog.create({data:{tenantId:ctx.tenantId,userId:ctx.userId||null,action:'license.device.revoke',entity:'LicenseActivation',entityId:req.params.activationId,after:{licenseId:req.params.licenseId,status:'revoked'} as any,ipAddress:req.ip,userAgent:req.headers['user-agent']||null}});
  ok(res,{id:req.params.activationId,licenseId:req.params.licenseId,status:'revoked'});
}));

export default router;
