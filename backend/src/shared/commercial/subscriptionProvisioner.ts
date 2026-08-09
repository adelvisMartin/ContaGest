import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {prisma} from '../../database/prisma.js';
import {HttpError} from '../http.js';
import {ensureAccountMembership,linkMembershipToAccount} from '../identity/accountMembership.js';
import {hashLicenseKey} from '../licensing/licenseGuard.js';
import {assertSubscriptionAccess} from './subscriptionGuard.js';

const permissionByModule:Record<string,string[]>={
  dashboard:['reports.view'],ventas:['sales.manage','sales.view'],cotizacion:['sales.manage','sales.view'],clientes:['clients.manage'],
  inventario:['inventory.manage'],kardex:['inventory.manage'],compras:['purchases.manage'],proveedores:['purchases.manage'],reportes:['reports.view'],analytics:['reports.view'],
  contabilidad:['reports.view'],'libro-mayor':['reports.view'],'balance-sumas-saldos':['reports.view'],'hoja-trabajo':['reports.view'],'estados-financieros':['reports.view'],'cierre-contable':['reports.view'],'plan-cuentas':['reports.view'],
  bancos:['banking.manage'],tributos:['taxes.export'],'libro-ventas':['taxes.export'],nomina:['payroll.manage'],rrhh:['payroll.manage'],salud:['health.manage'],veterinaria:['health.manage'],gimnasio:['gym.manage'],rutinas:['gym.manage'],nutricion:['gym.manage'],mensajes:['communications.manage'],'asistente-ia':['reports.view'],
  pedidos:['sales.manage'],'pos-sede':['sales.manage'],'tracking-pedidos':['sales.view']
};
function generateLicenseKey(){const token=crypto.randomBytes(24).toString('hex').toUpperCase();return `CGVE-SUB-${token.slice(0,8)}-${token.slice(8,16)}-${token.slice(16,24)}-${token.slice(24,32)}`;}
function generateTemporaryPassword(){return `Cg!${crypto.randomBytes(10).toString('base64url')}9a`;}
async function assignSubscriptionRole(tenantId:string,userId:string,modules:string[]){
  const permissionKeys=[...new Set(['reports.view',...modules.flatMap(module=>permissionByModule[module]||[])])];
  for(const key of permissionKeys)await prisma.permission.upsert({where:{key},update:{},create:{key,description:`Permiso ${key}`}});
  const roleName=`Suscripción ${userId.slice(0,8)}`;
  const role=await prisma.role.upsert({where:{tenantId_name:{tenantId,name:roleName}},update:{description:'Acceso derivado de suscripción comercial.',system:false},create:{tenantId,name:roleName,description:'Acceso derivado de suscripción comercial.',system:false}});
  await prisma.rolePermission.deleteMany({where:{roleId:role.id}});
  const permissions=await prisma.permission.findMany({where:{key:{in:permissionKeys}},select:{id:true}});
  if(permissions.length)await prisma.rolePermission.createMany({data:permissions.map(permission=>({roleId:role.id,permissionId:permission.id})),skipDuplicates:true});
  await prisma.userRole.upsert({where:{userId_roleId:{userId,roleId:role.id}},update:{},create:{userId,roleId:role.id}});
}

export async function provisionSubscriptionAccess(input:{subscriptionId:string;tenantId:string;email:string;fullName:string;maxDevices?:number}){
  const email=input.email.trim().toLowerCase();
  await assertSubscriptionAccess(input.subscriptionId,input.tenantId);
  const subscriptionRows=await prisma.$queryRaw<Array<{id:string;planCode:string;billingCycle:string;maxUsers:number;customerSegment:string}>>`
    SELECT s."id",s."planCode",s."billingCycle",s."maxUsers",s."customerSegment" FROM public."Subscription" s
    JOIN public."SubscriptionTenant" st ON st."subscriptionId"=s."id"
    WHERE s."id"=${input.subscriptionId} AND st."tenantId"=${input.tenantId} AND st."status"='active' LIMIT 1
  `;
  const subscription=subscriptionRows[0];if(!subscription)throw new HttpError(404,'La empresa no forma parte de la suscripción.');
  const tenant=await prisma.tenant.findUnique({where:{id:input.tenantId},select:{id:true,rif:true,name:true}});if(!tenant)throw new HttpError(404,'Empresa no encontrada.');
  const entitlements=await prisma.$queryRaw<Array<{moduleCode:string;kind:string}>>`SELECT "moduleCode","kind" FROM public."ModuleEntitlement" WHERE "subscriptionId"=${input.subscriptionId} AND "status"='active' ORDER BY "kind","moduleCode"`;
  const modules=entitlements.map(item=>item.moduleCode).filter(code=>!code.startsWith('channel.'));if(!modules.length)throw new HttpError(422,'La suscripción no tiene módulos operativos habilitados.');

  // Cross-tenant identity sharing is explicit and scoped to this subscription. A same email
  // elsewhere in ContaGest is not considered proof of identity.
  const linkedRows=await prisma.$queryRaw<Array<{accountUserId:string;userProfileId:string}>>`
    SELECT tm."accountUserId",tm."userProfileId"
    FROM public."LicenseKey" lk
    JOIN public."TenantMembership" tm ON tm."id"=lk."issuedForMembershipId"
    WHERE lk."subscriptionId"=${input.subscriptionId} AND lower(lk."userEmail")=${email}
    ORDER BY lk."createdAt" ASC LIMIT 1
  `;
  const linkedIdentity=linkedRows[0]||null;
  const target=await prisma.userProfile.findUnique({where:{tenantId_email:{tenantId:tenant.id,email}}});
  const source=linkedIdentity?await prisma.userProfile.findFirst({where:{id:linkedIdentity.userProfileId,status:'active',passwordHash:{not:null}}}):null;
  let temporaryPassword:string|null=null;
  let passwordHash=target?.passwordHash||source?.passwordHash||null;
  if(!passwordHash){temporaryPassword=generateTemporaryPassword();passwordHash=await bcrypt.hash(temporaryPassword,12);}
  const user=target?await prisma.userProfile.update({where:{id:target.id},data:{fullName:input.fullName,passwordHash,status:'active'}}):await prisma.userProfile.create({data:{tenantId:tenant.id,email,fullName:input.fullName,passwordHash,status:'active'}});

  let membership=await ensureAccountMembership({tenantId:tenant.id,userProfileId:user.id,email:user.email,fullName:user.fullName,roleLabel:subscription.planCode==='contador'?'Contador':'Cliente suscrito'});
  if(linkedIdentity&&membership?.accountUserId!==linkedIdentity.accountUserId){
    membership=await linkMembershipToAccount({userProfileId:user.id,accountUserId:linkedIdentity.accountUserId,linkSource:'platform-subscription'});
  }
  await assignSubscriptionRole(tenant.id,user.id,modules);

  const rawKey=generateLicenseKey();const technicalExpiry=new Date(Date.now()+3650*86400000);const config={enabled:modules,businessSector:subscription.customerSegment||'general',commercialUse:'operacion'};
  let record;
  try{
    record=await prisma.licenseKey.create({data:{tenantId:tenant.id,userId:user.id,userEmail:email,plan:subscription.billingCycle==='annual'?'annual':subscription.billingCycle==='quarterly'?'quarterly':'monthly',keyHash:hashLicenseKey(rawKey),keyPreview:`${rawKey.slice(0,14)}-••••-${rawKey.slice(-4)}`,modules:config as any,expiresAt:technicalExpiry,status:'active'}});
    await prisma.$executeRaw`UPDATE public."LicenseKey" SET "businessCategory"=${subscription.customerSegment||'general'},"companyName"=${tenant.name},"companyRif"=${tenant.rif},"maxUsers"=1,"maxDevices"=${Math.min(20,Math.max(1,Number(input.maxDevices||2)))},"activationCount"=0,"subscriptionId"=${input.subscriptionId},"issuedForMembershipId"=${membership?.id||null},"updatedAt"=now() WHERE "id"=${record.id}`;
  }catch(error:any){
    if(String(error?.message||'').includes('subscription_user_limit_reached'))throw new HttpError(409,'La suscripción alcanzó el máximo de usuarios distintos. Amplía el plan antes de agregar otra persona.');
    throw error;
  }
  const previous=await prisma.licenseKey.findMany({where:{tenantId:tenant.id,userEmail:email,status:'active',id:{not:record.id}},select:{id:true}});
  if(previous.length){await prisma.licenseKey.updateMany({where:{id:{in:previous.map(item=>item.id)}},data:{status:'revoked'}});for(const item of previous)await prisma.$executeRaw`UPDATE public."LicenseActivation" SET "status"='revoked',"revokedAt"=now() WHERE "licenseId"=${item.id}`;}
  return{licenseId:record.id,subscriptionId:input.subscriptionId,tenant:{id:tenant.id,rif:tenant.rif,name:tenant.name},user:{id:user.id,email:user.email,fullName:user.fullName},membershipId:membership?.id||null,modules,maxDevices:Math.min(20,Math.max(1,Number(input.maxDevices||2))),licenseKey:rawKey,temporaryPassword,technicalExpiresAt:technicalExpiry.toISOString(),note:temporaryPassword?'Guarda la contraseña y licencia ahora; se muestran una sola vez.':'La identidad ya existía. Conserva su contraseña actual; guarda únicamente la nueva licencia técnica.'};
}
