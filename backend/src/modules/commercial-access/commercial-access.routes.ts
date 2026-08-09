import {Router} from 'express';
import {z} from 'zod';
import {prisma} from '../../database/prisma.js';
import {asyncHandler,HttpError,ok} from '../../shared/http.js';
import {requirePermission,requireTenant} from '../../shared/middleware/context.js';
import {provisionSubscriptionAccess} from '../../shared/commercial/subscriptionProvisioner.js';

const router=Router();
router.use(requireTenant,requirePermission('platform.manage'));
const provisionSchema=z.object({tenantId:z.string().min(1).max(120),email:z.string().email(),fullName:z.string().trim().min(2).max(120),maxDevices:z.coerce.number().int().min(1).max(20).default(2)});

router.get('/subscriptions/:subscriptionId/users',asyncHandler(async(req,res)=>{
  const subscription=await prisma.$queryRaw<Array<{id:string}>>`SELECT "id" FROM public."Subscription" WHERE "id"=${req.params.subscriptionId} LIMIT 1`;
  if(!subscription[0])throw new HttpError(404,'Suscripción no encontrada.');
  const rows=await prisma.$queryRaw<any[]>`
    SELECT lower(lk."userEmail") AS "email",min(up."fullName") AS "fullName",count(DISTINCT lk."tenantId")::int AS "tenantCount",
           jsonb_agg(DISTINCT jsonb_build_object('tenantId',lk."tenantId",'tenantName',t."name",'rif',t."rif",'licenseId',lk."id",'status',lk."status")) AS tenants
    FROM public."LicenseKey" lk
    LEFT JOIN public."UserProfile" up ON up."id"=lk."userId"
    JOIN public."Tenant" t ON t."id"=lk."tenantId"
    WHERE lk."subscriptionId"=${req.params.subscriptionId}
    GROUP BY lower(lk."userEmail")
    ORDER BY min(up."fullName") NULLS LAST,lower(lk."userEmail")
  `;
  ok(res,rows);
}));

router.post('/subscriptions/:subscriptionId/users',asyncHandler(async(req,res)=>{
  const body=provisionSchema.parse(req.body||{});
  const result=await provisionSubscriptionAccess({subscriptionId:req.params.subscriptionId,...body});
  const ctx=(req as any).context;
  await prisma.auditLog.create({data:{tenantId:ctx.tenantId,userId:ctx.userId||null,action:'commercial.subscription.user.provision',entity:'Subscription',entityId:req.params.subscriptionId,after:{tenantId:body.tenantId,email:body.email,licenseId:result.licenseId,membershipId:result.membershipId} as any,ipAddress:req.ip,userAgent:req.headers['user-agent']||null}});
  ok(res,result,201);
}));

export default router;
