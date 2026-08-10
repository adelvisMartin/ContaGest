import type {Request,Response,NextFunction} from 'express';
import {prisma} from '../../database/prisma.js';
import {assertSubscriptionAccess} from './subscriptionGuard.js';

export async function enforceCommercialSubscription(req:Request,_res:Response,next:NextFunction){
  try{
    const ctx=(req as any).context as {tenantId?:string;userId?:string}|undefined;
    if(!ctx?.tenantId||!ctx.userId)return next();
    const platformPermission=await prisma.userRole.count({
      where:{userId:ctx.userId,role:{tenantId:ctx.tenantId,permissions:{some:{permission:{key:'platform.manage'}}}}}
    });
    if(platformPermission)return next();
    const license=await prisma.licenseKey.findFirst({
      where:{tenantId:ctx.tenantId,userId:ctx.userId,status:'active',expiresAt:{gt:new Date()}},
      orderBy:{createdAt:'desc'},select:{id:true}
    });
    if(!license)return next();
    const rows=await prisma.$queryRaw<Array<{subscriptionId:string|null}>>`
      SELECT "subscriptionId" FROM public."LicenseKey" WHERE "id"=${license.id} LIMIT 1
    `;
    await assertSubscriptionAccess(rows[0]?.subscriptionId||null,ctx.tenantId);
    next();
  }catch(error){next(error);}
}
