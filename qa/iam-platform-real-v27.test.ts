import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createApp } from '../backend/src/app.js';
import { prisma } from '../backend/src/database/prisma.js';
import { hasPlatformAccess } from '../backend/src/shared/identity/platformAccess.js';

const suffix=crypto.randomBytes(5).toString('hex');
const rif=`J-27${suffix.slice(0,7)}`.toUpperCase();
const email=`tenant-admin-${suffix}@example.test`;
const password='TenantAdmin#27-Secure';
const customerId=`qa27-customer-${suffix}`;
const subscriptionId=`qa27-sub-${suffix}`;
let tenantId='';
let userId='';
let roleId='';
let server:any;

function solve(question:string){
  const [leftRaw,op,rightRaw]=question.trim().split(/\s+/);
  const left=Number(leftRaw),right=Number(rightRaw);
  if(op==='+')return String(left+right);
  if(op==='-')return String(left-right);
  if(op==='×')return String(left*right);
  throw new Error(`Operador captcha no soportado: ${op}`);
}

async function request(base:string,path:string,init:RequestInit={}){
  return fetch(`${base}${path}`,init);
}

async function cleanup(){
  if(subscriptionId){
    await prisma.$executeRawUnsafe('DELETE FROM public."SubscriptionTenant" WHERE "subscriptionId"=$1',subscriptionId).catch(()=>undefined);
    await prisma.$executeRawUnsafe('DELETE FROM public."Subscription" WHERE "id"=$1',subscriptionId).catch(()=>undefined);
  }
  if(customerId)await prisma.$executeRawUnsafe('DELETE FROM public."CustomerAccount" WHERE "id"=$1',customerId).catch(()=>undefined);
  if(tenantId)await prisma.tenant.deleteMany({where:{id:tenantId}}).catch(()=>undefined);
}

async function main(){
  const tenant=await prisma.tenant.create({data:{rif,name:`QA IAM ${suffix}`,legalName:`QA IAM ${suffix}`,plan:'enterprise',status:'active',settings:{}}});
  tenantId=tenant.id;
  const user=await prisma.userProfile.create({data:{tenantId,email,fullName:'Tenant Admin QA',passwordHash:await bcrypt.hash(password,12),status:'active'}});
  userId=user.id;

  const adminPermission=await prisma.permission.upsert({where:{key:'admin.manage'},update:{},create:{key:'admin.manage',description:'QA admin'}});
  const platformPermission=await prisma.permission.upsert({where:{key:'platform.manage'},update:{},create:{key:'platform.manage',description:'QA platform'}});
  const role=await prisma.role.create({data:{tenantId,name:`Administrador QA ${suffix}`,description:'Rol tenant administrado por sistema',system:true}});
  roleId=role.id;
  await prisma.rolePermission.create({data:{roleId,permissionId:adminPermission.id}});
  await prisma.userRole.create({data:{userId,roleId}});

  const scopeRows=await prisma.$queryRawUnsafe<Array<{scope:string}>>('SELECT "scope" FROM public."Role" WHERE "id"=$1',roleId);
  assert.equal(scopeRows[0]?.scope,'tenant','un rol tenant system=true debe conservar scope tenant');
  assert.equal(await hasPlatformAccess({userId,tenantId}),false,'system=true no debe constituir identidad de plataforma');

  let dbRejected=false;
  try{
    await prisma.$executeRawUnsafe('INSERT INTO public."RolePermission" ("roleId","permissionId") VALUES ($1,$2)',roleId,platformPermission.id);
  }catch(error:any){
    dbRejected=true;
    assert.match(String(error?.message||error),/platform_permission_requires_internal_tenant|42501/i);
  }
  assert.equal(dbRejected,true,'PostgreSQL debe rechazar platform.manage sobre un rol de cliente');

  const app=createApp();
  server=app.listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('No se pudo resolver el puerto HTTP QA');
  const base=`http://127.0.0.1:${address.port}`;

  const captchaResponse=await request(base,'/api/v1/auth/captcha');
  assert.equal(captchaResponse.status,200);
  const captchaBody:any=await captchaResponse.json();
  const captcha=captchaBody.data;
  const loginResponse=await request(base,'/api/v1/auth/login',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      tenantRif:rif,email,password,captchaToken:captcha.token,captchaAnswer:solve(captcha.question)
    })
  });
  assert.equal(loginResponse.status,403,'tenant admin system=true sin licencia debe ser rechazado en login');

  const platformResponse=await request(base,'/api/v1/commercial/plans',{
    headers:{'x-tenant-id':tenantId,'x-user-id':userId}
  });
  assert.equal(platformResponse.status,403,'tenant admin no puede entrar a consola platform');

  await prisma.$executeRawUnsafe(
    'INSERT INTO public."CustomerAccount" ("id","legalName","rif","segment","status","metadata","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'{}\'::jsonb,now(),now())',
    customerId,`QA Customer ${suffix}`,rif,'smb','active'
  );
  await prisma.$executeRawUnsafe(
    'INSERT INTO public."Subscription" ("id","customerAccountId","planCode","customerSegment","billingCycle","currency","amount","status","startsAt","maxTenants","maxUsers","supportLevel","metadata","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10,$11,\'{}\'::jsonb,now(),now())',
    subscriptionId,customerId,'qa27','smb','monthly','USD',10,'suspended',1,3,'standard'
  );
  await prisma.$executeRawUnsafe(
    'INSERT INTO public."SubscriptionTenant" ("id","subscriptionId","tenantId","status","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,\'active\',now(),now())',
    subscriptionId,tenantId
  );
  const license=await prisma.licenseKey.create({data:{tenantId,userId,userEmail:email,plan:'qa27',keyHash:crypto.randomBytes(32).toString('hex'),keyPreview:'qa27…test',modules:['clientes'],expiresAt:new Date(Date.now()+86400000),status:'active'}});
  await prisma.$executeRawUnsafe('UPDATE public."LicenseKey" SET "subscriptionId"=$1 WHERE "id"=$2',subscriptionId,license.id);

  const suspendedResponse=await request(base,'/api/v1/commercial/plans',{
    headers:{'x-tenant-id':tenantId,'x-user-id':userId}
  });
  assert.equal(suspendedResponse.status,403,'system=true no debe saltarse una suscripción suspendida');

  console.log('[iam-platform-real-v27][PASS] tenant admin system=true no bypassa login/licencia, platform ni suscripción; DB rechazó platform.manage');
}

main().catch((error)=>{
  console.error('[iam-platform-real-v27][FAIL]',error);
  process.exitCode=1;
}).finally(async()=>{
  if(server)await new Promise<void>((resolve)=>server.close(()=>resolve()));
  await cleanup();
  await prisma.$disconnect();
});
