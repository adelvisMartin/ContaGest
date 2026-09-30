import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import {
  isBootstrapRegistrationConflict,
  registerTenantBootstrap,
  resolveLoginBootstrapIdentity
} from '../../database/auth-bootstrap.js';
import { runWithRuntimeTenant } from '../../database/runtime-tenant-context.js';
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
import { experienceProfileForMode } from '../../shared/contracts/accessManifest.js';
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
// Unknown identities still pay a bcrypt cost comparable to a real password check.
// The dummy hash is never authoritative: a server-resolved bootstrap identity and
// a tenant-scoped active profile are both required before authentication succeeds.
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

async function loadActiveTenantUser(tenantId:string,userId:string){
  return runWithRuntimeTenant(tenantId,async()=>{
    const user=await prisma.userProfile.findFirst({
      where:{id:userId,tenantId,status:'active'},
      include:{tenant:true,userRoles:userRoleInclude}
    });
    if(user)ensureAccessNotExpired(user);
    return user;
  });
}

async function sessionPayload(req:any,res:any,user:any,tenant:any,options:{role?:string;license?:any;rotateResult?:any}={}){
  // Multi-company discovery is an existing identity-plane authority. Establish the
  // current tenant membership under tenant context first, then perform only the
  // identity listing outside it; all current-tenant session/license work is scoped.
  const identity=await runWithRuntimeTenant(tenant.id,async()=>{
    const platformOperator=await hasPlatformAccess({userId:user.id,tenantId:tenant.id});
    const role=options.role||roleForUser(user,platformOperator);
    await ensureAccountMembership({tenantId:tenant.id,userProfileId:user.id,email:user.email,fullName:user.fullName,roleLabel:role});
    return{platformOperator,role};
  });
  const accessibleTenants=await listAccessibleTenants(user.id);
  return runWithRuntimeTenant(tenant.id,async()=>{
    const cookieSession=options.rotateResult||await issueBrowserSession(req,res,user,tenant.id,{role:identity.role,audience:identity.role==='client'?'client':'staff'});
    const effectiveLicense=options.license!==undefined
      ? options.license
      : identity.platformOperator
        ? null
        : await activeLicenseForProfile(user.id,tenant.id);
    const safeLicense=publicLicense(effectiveLicense);
    const experienceProfile=experienceProfileForMode(safeLicense?.businessSector||identity.role);
    return{
      ...cookieSession,
      tenantId:tenant.id,
      tenant,
      user:publicUser(user,identity.role),
      license:safeLicense,
      experienceProfile,
      accessibleTenants
    };
  });
}

async function authenticatedSession(req:any){
  const auth=readAccessToken(req);
  if(!auth)throw new HttpError(401,'Sesión requerida.');
  let decoded:any;try{decoded=verifyAccessToken(auth.token);}catch{throw new HttpError(401,'Sesión inválida o expirada.');}
  if(!decoded.sid)throw new HttpError(401,'El token de acceso no está vinculado a una sesión de servidor.');

  try{
    return await runWithRuntimeTenant(decoded.tenantId,async()=>{
      const rows=await prisma.$queryRaw<Array<{status:string;expiresAt:Date}>>`
        SELECT "status","expiresAt"
        FROM public."UserSession"
        WHERE "id"=${decoded.sid} AND "userId"=${decoded.sub} AND "tenantId"=${decoded.tenantId}
        LIMIT 1
      `;
      const browserSession=rows[0];
      if(!browserSession||browserSession.status!=='active'||new Date(browserSession.expiresAt).getTime()<=Date.now())throw new HttpError(401,'La sesión fue revocada o venció.');

      const user=await prisma.userProfile.findFirst({
        where:{id:decoded.sub,tenantId:decoded.tenantId,status:'active'},
        include:{tenant:true,userRoles:userRoleInclude}
      });
      if(!user)throw new HttpError(401,'Usuario no encontrado o deshabilitado.');
      ensureAccessNotExpired(user);
      return{decoded,user,authMode:auth.mode};
    });
  }catch(error){
    if(error instanceof HttpError)throw error;
    throw new HttpError(401,'Sesión inválida o expirada.');
  }
}

router.get('/captcha',(_req,res)=>ok(res,createCaptchaChallenge()));

router.post('/register',validateBody(registerSchema),asyncHandler(async(req,res)=>{
  const registerKey=req.header('x-admin-register-key')||'',publicAllowed=env.ALLOW_PUBLIC_REGISTER==='true'||(!isProd&&env.ALLOW_PUBLIC_REGISTER==='local'),keyAllowed=Boolean(env.ADMIN_REGISTER_KEY&&registerKey===env.ADMIN_REGISTER_KEY);
  if(!publicAllowed&&!keyAllowed)throw new HttpError(403,'Registro público deshabilitado. La empresa debe ser creada por un administrador.');
  verifyCaptcha(req.body);
  const body=req.body,email=String(body.email).trim().toLowerCase(),tenantRif=String(body.tenantRif).trim().toUpperCase();
  const passwordHash=await bcrypt.hash(body.password,12);

  let provisioned:{tenantId:string;userProfileId:string};
  try{
    provisioned=await registerTenantBootstrap({
      tenantRif,
      tenantName:body.tenantName,
      legalName:body.legalName||body.tenantName,
      plan:body.plan||'enterprise',
      email,
      fullName:body.fullName,
      passwordHash
    });
  }catch(error){
    if(isBootstrapRegistrationConflict(error))throw new HttpError(409,'El RIF o correo ya está asociado a un alta concurrente. Revisa la empresa existente antes de reintentar.');
    throw error;
  }

  const sessionUser=await loadActiveTenantUser(provisioned.tenantId,provisioned.userProfileId);
  if(!sessionUser)throw new HttpError(500,'El alta se confirmó pero la sesión administrativa no pudo materializarse.');
  ok(res,await sessionPayload(req,res,sessionUser,sessionUser.tenant,{role:'admin'}),201);
}));

router.post('/login',validateBody(loginSchema),asyncHandler(async(req,res)=>{
  verifyCaptcha(req.body);
  const throttle=await getLoginThrottleState(req);
  if(throttle.state.locked){
    logAuthSecurityEvent('auth.login.failed',req,throttle.identity,{reason:'throttled'});
    throw new HttpError(401,INVALID_LOGIN_MESSAGE);
  }

  const bootstrap=await resolveLoginBootstrapIdentity(throttle.identity.tenantRif,throttle.identity.email);
  const candidateHash=bootstrap?.passwordHash||await dummyPasswordHashPromise;
  const passwordValid=await bcrypt.compare(req.body.password,candidateHash);
  if(!bootstrap||!bootstrap.passwordHash||!passwordValid){
    await recordLoginFailure(req,{tenantId:bootstrap?.tenantId,reason:bootstrap?'invalid_password':'identity_not_found'});
    throw new HttpError(401,INVALID_LOGIN_MESSAGE);
  }

  const user=await loadActiveTenantUser(bootstrap.tenantId,bootstrap.userProfileId);
  if(!user||user.passwordHash!==bootstrap.passwordHash){
    await recordLoginFailure(req,{tenantId:bootstrap.tenantId,reason:user?'credential_changed':'account_inactive'});
    throw new HttpError(401,INVALID_LOGIN_MESSAGE);
  }

  await recordLoginSuccess(req,bootstrap.tenantId);
  const loginState=await runWithRuntimeTenant(bootstrap.tenantId,async()=>{
    const platformOperator=await hasPlatformAccess({userId:user.id,tenantId:bootstrap.tenantId});
    const role=roleForUser(user,platformOperator);
    let license:any=null;
    if(!platformOperator){
      license=await validateUserLicense({
        tenantId:bootstrap.tenantId,userId:user.id,userEmail:user.email,
        licenseKey:req.body.licenseKey||null,deviceId:req.body.deviceId||null,
        deviceCredential:readDeviceCredential(req),deviceLabel:req.body.deviceLabel||null,
        route:'login',ip:req.ip,userAgent:req.headers['user-agent']||null,
        metadata:{source:'login',accessMode:'client'}
      });
      if(license._issuedDeviceCredential){
        setDeviceCredentialCookie(res,license._issuedDeviceCredential,license._issuedDeviceCredentialExpiresAt);
      }
    }
    await ensureAccountMembership({tenantId:bootstrap.tenantId,userProfileId:user.id,email:user.email,fullName:user.fullName,roleLabel:role});
    const safeLicense=publicLicense(license);
    const mfa=await issueCoordinateChallenge({tenantId:bootstrap.tenantId,userId:user.id,ip:req.ip,userAgent:req.headers['user-agent']||'',context:{role,license:safeLicense}});
    return{role,safeLicense,mfa};
  });

  if(loginState.mfa)return ok(res,{...loginState.mfa,user:{email:user.email,fullName:user.fullName},tenant:{id:user.tenant.id,name:user.tenant.name,rif:user.tenant.rif}},202);
  ok(res,await sessionPayload(req,res,user,user.tenant,{role:loginState.role,license:loginState.safeLicense}));
}));

router.post('/login/coordinates',validateBody(coordinateLoginSchema),asyncHandler(async(req,res)=>{
  const verified=await verifyCoordinateChallenge({challengeId:req.body.challengeId,answers:req.body.answers,ip:req.ip,userAgent:req.headers['user-agent']||''});
  const user=await loadActiveTenantUser(verified.tenantId,verified.userId);
  if(!user)throw new HttpError(401,'Usuario del reto no disponible.');
  const context=verified.context as any;
  ok(res,await sessionPayload(req,res,user,user.tenant,{role:context.role,license:context.license||null}));
}));

router.get('/coordinates/status',asyncHandler(async(req,res)=>{
  const{user}=await authenticatedSession(req);
  ok(res,await runWithRuntimeTenant(user.tenantId,()=>coordinateCardStatus(user.tenantId,user.id)));
}));
router.post('/coordinates/enroll',asyncHandler(async(req,res)=>{
  const{user}=await authenticatedSession(req);
  ok(res,await runWithRuntimeTenant(user.tenantId,()=>generateCoordinateCard(user.tenantId,user.id)),201);
}));
router.post('/coordinates/revoke',asyncHandler(async(req,res)=>{
  const{user}=await authenticatedSession(req);
  ok(res,await runWithRuntimeTenant(user.tenantId,()=>revokeCoordinateCard(user.tenantId,user.id)));
}));
router.get('/me',asyncHandler(async(req,res)=>{
  const{decoded,user}=await authenticatedSession(req);
  const accessibleTenants=await listAccessibleTenants(user.id);
  const current=await runWithRuntimeTenant(user.tenantId,async()=>{
    const platformOperator=await hasPlatformAccess({userId:user.id,tenantId:user.tenantId});
    const role=roleForUser(user,platformOperator);
    const license=platformOperator?null:await activeLicenseForProfile(user.id,user.tenantId);
    const coordinateCard=await coordinateCardStatus(user.tenantId,user.id);
    return{role,license,coordinateCard};
  });
  ok(res,{
    sessionMode:'cookie',
    tenantId:user.tenantId,
    user:publicUser(user,current.role),
    tenant:user.tenant,
    license:current.license,
    experienceProfile:experienceProfileForMode(current.license?.businessSector||current.role),
    accessibleTenants,
    coordinateCard:current.coordinateCard,
    expiresAt:decoded.exp?decoded.exp*1000:null
  });
}));
router.get('/tenants',asyncHandler(async(req,res)=>{
  const{user}=await authenticatedSession(req);
  ok(res,await listAccessibleTenants(user.id));
}));
router.post('/switch-tenant',validateBody(switchTenantSchema),asyncHandler(async(req,res)=>{
  const{user}=await authenticatedSession(req);
  const target=await resolveTenantSwitch(user.id,req.body.tenantId);
  const targetUser=await loadActiveTenantUser(target.tenantId,target.userProfileId);
  if(!targetUser)throw new HttpError(403,'La membresía destino ya no está disponible.');
  await revokeBrowserSession(req,res);
  ok(res,await sessionPayload(req,res,targetUser,targetUser.tenant));
}));
router.post('/refresh',asyncHandler(async(req,res)=>{
  const rotated=await rotateBrowserSession(req,res);
  const user=await loadActiveTenantUser(rotated.tenantId,rotated.userId);
  if(!user)throw new HttpError(401,'La cuenta ya no está activa.');
  ok(res,await sessionPayload(req,res,user,user.tenant,{rotateResult:rotated}));
}));
router.post('/logout',asyncHandler(async(req,res)=>{await revokeBrowserSession(req,res);ok(res,{loggedOut:true});}));

export default router;