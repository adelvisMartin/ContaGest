import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { env, isProd } from '../../config/env.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { verifyAccessToken } from '../../shared/auth/jwt.js';
import {
  issueBrowserSession,
  readAccessToken,
  readDeviceCredential,
  revokeBrowserSession,
  rotateBrowserSession,
  setDeviceCredentialCookie
} from '../../shared/auth/sessionCookies.js';
import { validateUserLicense } from '../../shared/licensing/licenseGuard.js';
import { activeLicenseForProfile, ensureAccountMembership, listAccessibleTenants, resolveTenantSwitch } from '../../shared/identity/accountMembership.js';
import { hasPlatformAccess } from '../../shared/identity/platformAccess.js';
import { coordinateCardStatus, generateCoordinateCard, issueCoordinateChallenge, revokeCoordinateCard, verifyCoordinateChallenge } from '../../shared/auth/coordinateCard.js';
import {
  getLoginThrottleState,
  INVALID_LOGIN_MESSAGE,
  logAuthSecurityEvent,
  recordLoginFailure,
  recordLoginSuccess
} from './auth.throttle.js';

const router = Router();
const userRoleInclude = { include:{ role:{ include:{ permissions:{ include:{ permission:true } } } } } } as const;
// Unknown/inactive identities still pay a bcrypt cost comparable to a real password
// check. The dummy hash is never authoritative: a real active user + passwordHash is
// still required before authentication can succeed.
const dummyPasswordHashPromise = bcrypt.hash('contagest-invalid-login-timing-equalizer',12);

function ensureAccessNotExpired(user:{accessExpiresAt?:Date|null}) {
  if(user.accessExpiresAt&&user.accessExpiresAt.getTime()<=Date.now())throw new HttpError(403,'El acceso temporal venció. Solicita una nueva invitación.');
}

const captchaFields = { captchaToken:z.string().min(20), captchaAnswer:z.string().min(1).max(10) };
const registerSchema = z.object({ tenantRif:z.string().min(5), tenantName:z.string().min(2), legalName:z.string().optional(), fullName:z.string().min(2), email:z.string().email(), password:z.string().min(12).max(128), plan:z.string().default('enterprise'), ...captchaFields });
const loginSchema = z.object({
  email:z.string().email(), password:z.string().min(1).max(128), tenantRif:z.string().min(5).default('00000000'),
  accessMode:z.enum(['staff','client']).optional(),
  licenseKey:z.string().min(20).max(180).optional(), deviceId:z.string().min(8).max(240).optional(), deviceLabel:z.string().max(120).optional(), ...captchaFields
});
const coordinateLoginSchema = z.object({
  challengeId:z.string().uuid(),
  answers:z.record(z.string().regex(/^[A-L](10|[1-9])$/),z.string().regex(/^\d{4}$/))
});
const switchTenantSchema = z.object({ tenantId:z.string().min(1).max(120) });

function signCaptchaPayload(payload:string){return crypto.createHmac('sha256',env.JWT_SECRET).update(payload).digest('base64url');}
function signCaptchaAnswer(nonce:string,answer:string){return crypto.createHmac('sha256',env.JWT_SECRET).update(`captcha:${nonce}:${answer}`).digest('base64url');}
function createCaptchaChallenge(){
  const a=crypto.randomInt(2,13),b=crypto.randomInt(2,13),ops=['+','-','×'],op=ops[crypto.randomInt(0,ops.length)];
  const left=op==='-'?Math.max(a,b):a,right=op==='-'?Math.min(a,b):b;
  const expected=op==='+'?left+right:op==='-'?left-right:left*right,issuedAt=Date.now(),exp=issuedAt+5*60*1000,nonce=crypto.randomBytes(18).toString('base64url');
  const answerSig=signCaptchaAnswer(nonce,String(expected));
  const payload=Buffer.from(JSON.stringify({kind:'math',a:left,b:right,op,issuedAt,exp,nonce,answerSig})).toString('base64url');
  return {kind:'math',question:`${left} ${op} ${right}`,prompt:`¿Cuánto es ${left} ${op==='×'?'por':op} ${right}?`,token:`${payload}.${signCaptchaPayload(payload)}`,expiresAt:exp,refreshAfterSeconds:300};
}
function safeSignatureEqual(left:string,right:string){const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
function verifyCaptcha(body:{captchaToken?:string;captchaAnswer?:string}){
  const[payload,sig]=String(body.captchaToken||'').split('.'),expectedSig=payload?signCaptchaPayload(payload):'';
  if(!payload||!sig||!safeSignatureEqual(expectedSig,sig))throw new HttpError(422,'Captcha inválido. Actualiza el reto e intenta de nuevo.');
  let challenge:any;try{challenge=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{throw new HttpError(422,'Captcha corrupto. Actualiza el reto.');}
  if(challenge?.kind!=='math'||!challenge?.exp||!challenge?.nonce||!challenge?.answerSig)throw new HttpError(422,'Captcha inválido. Actualiza el reto.');
  if(Number(challenge.issuedAt)>Date.now()+30_000||Date.now()>Number(challenge.exp))throw new HttpError(422,'Captcha expirado. Actualiza el reto.');
  const numericAnswer=Number(String(body.captchaAnswer||'').trim());
  if(!Number.isFinite(numericAnswer))throw new HttpError(422,'Captcha incorrecto. Verifica la operación.');
  const actualAnswerSig=signCaptchaAnswer(String(challenge.nonce),String(numericAnswer));
  if(!safeSignatureEqual(String(challenge.answerSig),actualAnswerSig))throw new HttpError(422,'Captcha incorrecto. Verifica la operación.');
}

function permissionsForUser(user:any){
  return [...new Set((user?.userRoles||[]).flatMap((assignment:any)=>(assignment?.role?.permissions||[]).map((item:any)=>item?.permission?.key).filter(Boolean)))];
}
function hasAdminPermission(user:any){return permissionsForUser(user).includes('admin.manage');}
function roleForUser(user:any,platformOperator=false){return hasAdminPermission(user)?'admin':platformOperator?'staff':'client';}
function publicUser(user:any,role:string){return{id:user.id,email:user.email,fullName:user.fullName,name:user.fullName,status:user.status,role,permissions:permissionsForUser(user),accessExpiresAt:user.accessExpiresAt||null};}
function publicLicense(license:any){
  if(!license)return null;
  const{_issuedDeviceCredential,_issuedDeviceCredentialExpiresAt,...safe}=license;
  return safe;
}

async function sessionPayload(req:any,res:any,user:any,tenant:any,options:{role?:string;license?:any;rotateResult?:any}={}){
  const platformOperator=await hasPlatformAccess({userId:user.id,tenantId:tenant.id});
  const role=options.role||roleForUser(user,platformOperator);
  await ensureAccountMembership({tenantId:tenant.id,userProfileId:user.id,email:user.email,fullName:user.fullName,roleLabel:role});
  const cookieSession=options.rotateResult||await issueBrowserSession(req,res,user,tenant.id,{role,audience:role==='client'?'client':'staff'});
  const accessibleTenants=await listAccessibleTenants(user.id);
  const effectiveLicense=options.license!==undefined
    ? options.license
    : platformOperator
      ? null
      : await activeLicenseForProfile(user.id,tenant.id);
  return{
    ...cookieSession,
    tenantId:tenant.id,
    tenant,
    user:publicUser(user,role),
    license:publicLicense(effectiveLicense),
    accessibleTenants
  };
}

async function ensureAdminRole(db:any,tenantId:string,userId:string){
  const permissionKeys=['admin.manage','clients.manage','inventory.manage','sales.manage','sales.view','purchases.manage','reports.view','modules.manage','payroll.manage','banking.manage','taxes.export','health.manage','gym.manage','communications.manage'];
  for(const key of permissionKeys)await db.permission.upsert({where:{key},update:{},create:{key,description:`Permiso ${key}`}});
  const role=await db.role.upsert({where:{tenantId_name:{tenantId,name:'Administrador'}},update:{description:'Rol administrador de ContaGest.',system:true},create:{tenantId,name:'Administrador',description:'Rol administrador de ContaGest.',system:true}});
  const permissions=await db.permission.findMany({where:{key:{in:permissionKeys}},select:{id:true}});
  for(const permission of permissions)await db.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}},update:{},create:{roleId:role.id,permissionId:permission.id}});
  await db.userRole.upsert({where:{userId_roleId:{userId,roleId:role.id}},update:{},create:{userId,roleId:role.id}});
}

async function authenticatedSession(req:any){
  const auth=readAccessToken(req);
  if(!auth)throw new HttpError(401,'Sesión requerida.');
  let decoded:any;try{decoded=verifyAccessToken(auth.token);}catch{throw new HttpError(401,'Sesión inválida o expirada.');}
  if(auth.mode==='cookie'&&decoded.sid){
    const rows=await prisma.$queryRaw<Array<{status:string;expiresAt:Date}>>`
      SELECT "status","expiresAt" FROM public."UserSession" WHERE "id"=${decoded.sid} AND "userId"=${decoded.sub} AND "tenantId"=${decoded.tenantId} LIMIT 1
    `;
    const browserSession=rows[0];
    if(!browserSession||browserSession.status!=='active'||new Date(browserSession.expiresAt).getTime()<=Date.now())throw new HttpError(401,'La sesión fue revocada o venció.');
  }
  const user=await prisma.userProfile.findFirst({where:{id:decoded.sub,tenantId:decoded.tenantId,status:'active'},include:{tenant:true,userRoles:userRoleInclude}});
  if(!user)throw new HttpError(401,'Usuario no encontrado o deshabilitado.');ensureAccessNotExpired(user);return{decoded,user,authMode:auth.mode};
}

router.get('/captcha',(_req,res)=>ok(res,createCaptchaChallenge()));

router.post('/register',validateBody(registerSchema),asyncHandler(async(req,res)=>{
  const registerKey=req.header('x-admin-register-key')||'',publicAllowed=env.ALLOW_PUBLIC_REGISTER==='true'||(!isProd&&env.ALLOW_PUBLIC_REGISTER==='local'),keyAllowed=Boolean(env.ADMIN_REGISTER_KEY&&registerKey===env.ADMIN_REGISTER_KEY);
  if(!publicAllowed&&!keyAllowed)throw new HttpError(403,'Registro público deshabilitado. La empresa debe ser creada por un administrador.');
  verifyCaptcha(req.body);
  const body=req.body,email=String(body.email).trim().toLowerCase(),tenantRif=String(body.tenantRif).trim().toUpperCase();
  const passwordHash=await bcrypt.hash(body.password,12);
  let provisioned:{tenant:any;userId:string};
  try{
    provisioned=await prisma.$transaction(async(tx)=>{
      const existingTenant=await tx.tenant.findFirst({where:{rif:{equals:tenantRif,mode:'insensitive'}},select:{id:true}});
      if(existingTenant)throw new HttpError(409,'Ya existe una empresa registrada con ese RIF. Usa el acceso existente o solicita vinculación controlada.');
      const tenant=await tx.tenant.create({data:{rif:tenantRif,name:body.tenantName,legalName:body.legalName||body.tenantName,plan:body.plan||'enterprise',status:'active',settings:{}}});
      const user=await tx.userProfile.create({data:{tenantId:tenant.id,email,fullName:body.fullName,passwordHash,status:'active'}});
      await ensureAdminRole(tx,tenant.id,user.id);
      await ensureAccountMembership({tenantId:tenant.id,userProfileId:user.id,email:user.email,fullName:user.fullName,roleLabel:'Administrador'},tx);
      return{tenant,userId:user.id};
    });
  }catch(error:any){
    if(error instanceof HttpError)throw error;
    if(error?.code==='P2002')throw new HttpError(409,'El RIF o correo ya está asociado a un alta concurrente. Revisa la empresa existente antes de reintentar.');
    throw error;
  }
  const sessionUser=await prisma.userProfile.findUnique({where:{id:provisioned.userId},include:{userRoles:userRoleInclude}});
  if(!sessionUser)throw new HttpError(500,'El alta se confirmó pero la sesión administrativa no pudo materializarse.');
  ok(res,await sessionPayload(req,res,sessionUser,provisioned.tenant,{role:'admin'}),201);
}));

router.post('/login',validateBody(loginSchema),asyncHandler(async(req,res)=>{
  verifyCaptcha(req.body);
  const throttle=await getLoginThrottleState(req);
  if(throttle.state.locked){
    logAuthSecurityEvent('auth.login.failed',req,throttle.identity,{reason:'throttled'});
    throw new HttpError(401,INVALID_LOGIN_MESSAGE);
  }

  const tenant=await prisma.tenant.findFirst({where:{rif:{equals:throttle.identity.tenantRif,mode:'insensitive'}}});
  const user=tenant
    ? await prisma.userProfile.findFirst({where:{tenantId:tenant.id,email:throttle.identity.email},include:{userRoles:userRoleInclude}})
    : null;
  const candidateHash=user?.passwordHash||await dummyPasswordHashPromise;
  const passwordValid=await bcrypt.compare(req.body.password,candidateHash);

  if(!tenant||!user||user.status!=='active'||!user.passwordHash||!passwordValid){
    const reason=!tenant
      ? 'tenant_not_found'
      : !user
        ? 'user_not_found'
        : user.status!=='active'
          ? 'account_inactive'
          : 'invalid_password';
    await recordLoginFailure(req,{tenantId:tenant?.id,reason});
    throw new HttpError(401,INVALID_LOGIN_MESSAGE);
  }

  await recordLoginSuccess(req,tenant.id);
  ensureAccessNotExpired(user);
  const platformOperator=await hasPlatformAccess({userId:user.id,tenantId:tenant.id});
  const role=roleForUser(user,platformOperator);
  let license:any=null;
  if(!platformOperator){
    license=await validateUserLicense({
      tenantId:tenant.id,userId:user.id,userEmail:user.email,
      licenseKey:req.body.licenseKey||null,deviceId:req.body.deviceId||null,
      deviceCredential:readDeviceCredential(req),deviceLabel:req.body.deviceLabel||null,
      route:'login',ip:req.ip,userAgent:req.headers['user-agent']||null,
      metadata:{source:'login',accessMode:'client'}
    });
    if(license._issuedDeviceCredential){
      setDeviceCredentialCookie(res,license._issuedDeviceCredential,license._issuedDeviceCredentialExpiresAt);
    }
  }
  await ensureAccountMembership({tenantId:tenant.id,userProfileId:user.id,email:user.email,fullName:user.fullName,roleLabel:role});
  const safeLicense=publicLicense(license);
  const mfa=await issueCoordinateChallenge({tenantId:tenant.id,userId:user.id,ip:req.ip,userAgent:req.headers['user-agent']||'',context:{role,license:safeLicense}});
  if(mfa)return ok(res,{...mfa,user:{email:user.email,fullName:user.fullName},tenant:{id:tenant.id,name:tenant.name,rif:tenant.rif}},202);
  ok(res,await sessionPayload(req,res,user,tenant,{role,license:safeLicense}));
}));

router.post('/login/coordinates',validateBody(coordinateLoginSchema),asyncHandler(async(req,res)=>{
  const verified=await verifyCoordinateChallenge({challengeId:req.body.challengeId,answers:req.body.answers,ip:req.ip,userAgent:req.headers['user-agent']||''});
  const user=await prisma.userProfile.findFirst({where:{id:verified.userId,tenantId:verified.tenantId,status:'active'},include:{tenant:true,userRoles:userRoleInclude}});if(!user)throw new HttpError(401,'Usuario del reto no disponible.');ensureAccessNotExpired(user);
  const context=verified.context as any;
  ok(res,await sessionPayload(req,res,user,user.tenant,{role:context.role,license:context.license||null}));
}));

router.get('/coordinates/status',asyncHandler(async(req,res)=>{const{user}=await authenticatedSession(req);ok(res,await coordinateCardStatus(user.tenantId,user.id));}));
router.post('/coordinates/enroll',asyncHandler(async(req,res)=>{const{user}=await authenticatedSession(req);ok(res,await generateCoordinateCard(user.tenantId,user.id),201);}));
router.post('/coordinates/revoke',asyncHandler(async(req,res)=>{const{user}=await authenticatedSession(req);ok(res,await revokeCoordinateCard(user.tenantId,user.id));}));
router.get('/me',asyncHandler(async(req,res)=>{const{decoded,user}=await authenticatedSession(req);const platformOperator=await hasPlatformAccess({userId:user.id,tenantId:user.tenantId});const role=roleForUser(user,platformOperator);ok(res,{sessionMode:'cookie',tenantId:user.tenantId,user:publicUser(user,role),tenant:user.tenant,license:platformOperator?null:await activeLicenseForProfile(user.id,user.tenantId),accessibleTenants:await listAccessibleTenants(user.id),coordinateCard:await coordinateCardStatus(user.tenantId,user.id),expiresAt:decoded.exp?decoded.exp*1000:null});}));
router.get('/tenants',asyncHandler(async(req,res)=>{const{user}=await authenticatedSession(req);ok(res,await listAccessibleTenants(user.id));}));
router.post('/switch-tenant',validateBody(switchTenantSchema),asyncHandler(async(req,res)=>{
  const{user}=await authenticatedSession(req);
  const target=await resolveTenantSwitch(user.id,req.body.tenantId);
  const targetUser=await prisma.userProfile.findFirst({where:{id:target.userProfileId,tenantId:target.tenantId,status:'active'},include:{tenant:true,userRoles:userRoleInclude}});
  if(!targetUser)throw new HttpError(403,'La membresía destino ya no está disponible.');
  await revokeBrowserSession(req,res);
  ok(res,await sessionPayload(req,res,targetUser,targetUser.tenant));
}));
router.post('/refresh',asyncHandler(async(req,res)=>{
  const rotated=await rotateBrowserSession(req,res);
  const user=await prisma.userProfile.findFirst({where:{id:rotated.userId,tenantId:rotated.tenantId,status:'active'},include:{tenant:true,userRoles:userRoleInclude}});
  if(!user)throw new HttpError(401,'La cuenta ya no está activa.');
  ok(res,await sessionPayload(req,res,user,user.tenant,{rotateResult:rotated}));
}));
router.post('/logout',asyncHandler(async(req,res)=>{await revokeBrowserSession(req,res);ok(res,{loggedOut:true});}));

export default router;