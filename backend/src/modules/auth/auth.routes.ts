import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { env, isProd } from '../../config/env.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { signAccessToken, tokenExpiresAt, verifyAccessToken } from '../../shared/auth/jwt.js';
import { validateUserLicense } from '../../shared/licensing/licenseGuard.js';
import { coordinateCardStatus, generateCoordinateCard, issueCoordinateChallenge, revokeCoordinateCard, verifyCoordinateChallenge } from '../../shared/auth/coordinateCard.js';

const router = Router();
const LOGIN_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 5;
const userRoleInclude = { include:{ role:{ include:{ permissions:{ include:{ permission:true } } } } } } as const;

function loginIdentity(req:any) {
  return {
    tenantRif:String(req.body?.tenantRif || '').trim().toUpperCase(),
    email:String(req.body?.email || '').trim().toLowerCase(),
    ipAddress:String(req.ip || 'unknown').slice(0, 120)
  };
}

async function failureCount(req:any) {
  const identity=loginIdentity(req);
  return prisma.authLoginAttempt.count({
    where:{tenantRif:identity.tenantRif,email:identity.email,success:false,createdAt:{gt:new Date(Date.now()-LOGIN_FAILURE_WINDOW_MS)}}
  });
}

async function recordLoginFailure(req:any,userId?:string) {
  const identity=loginIdentity(req);
  await prisma.authLoginAttempt.create({data:{...identity,success:false}});
  const failures=await failureCount(req);
  if(userId&&failures>=LOGIN_FAILURE_LIMIT){
    await prisma.userProfile.updateMany({where:{id:userId,status:'active'},data:{status:'disabled'}});
  }
  return failures;
}

async function recordLoginSuccess(req:any) {
  const identity=loginIdentity(req);
  await prisma.authLoginAttempt.create({data:{...identity,success:true}});
  await prisma.authLoginAttempt.deleteMany({where:{tenantRif:identity.tenantRif,email:identity.email,success:false}});
  void prisma.authLoginAttempt.deleteMany({where:{createdAt:{lt:new Date(Date.now()-90*86400000)}}}).catch(()=>undefined);
}

function ensureAccessNotExpired(user:{accessExpiresAt?:Date|null}) {
  if(user.accessExpiresAt&&user.accessExpiresAt.getTime()<=Date.now())throw new HttpError(403,'El acceso temporal venció. Solicita una nueva invitación.');
}

const captchaFields = { captchaToken:z.string().min(20), captchaAnswer:z.string().min(1).max(10) };
const registerSchema = z.object({ tenantRif:z.string().min(5), tenantName:z.string().min(2), legalName:z.string().optional(), fullName:z.string().min(2), email:z.string().email(), password:z.string().min(12).max(128), plan:z.string().default('enterprise'), ...captchaFields });
const loginSchema = z.object({
  email:z.string().email(), password:z.string().min(1).max(128), tenantRif:z.string().min(5).default('00000000'),
  accessMode:z.enum(['staff','client']).default('staff'),
  licenseKey:z.string().min(20).max(180).optional(), deviceId:z.string().min(8).max(240).optional(), deviceLabel:z.string().max(120).optional(), ...captchaFields
});
const coordinateLoginSchema = z.object({
  challengeId:z.string().uuid(),
  answers:z.record(z.string().regex(/^[A-L](10|[1-9])$/),z.string().regex(/^\d{4}$/))
});

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
function isInternalUser(user:any){return Array.isArray(user?.userRoles)&&user.userRoles.some((assignment:any)=>assignment?.role?.system===true);}
function hasAdminPermission(user:any){return permissionsForUser(user).includes('admin.manage');}
function roleForUser(user:any){return hasAdminPermission(user)?'admin':isInternalUser(user)?'staff':'client';}
function publicUser(user:any,role=roleForUser(user)){return{id:user.id,email:user.email,fullName:user.fullName,name:user.fullName,status:user.status,role,permissions:permissionsForUser(user),accessExpiresAt:user.accessExpiresAt||null};}
function buildSession(user:any,tenant:any,options:{role?:string;license?:any}={}){const token=signAccessToken(user,tenant.id);return{token,tenantId:tenant.id,tenant,user:publicUser(user,options.role||roleForUser(user)),license:options.license||null,expiresAt:tokenExpiresAt(token)};}

async function ensureAdminRole(tenantId:string,userId:string){
  const permissionKeys=['admin.manage','clients.manage','inventory.manage','sales.manage','sales.view','purchases.manage','reports.view','modules.manage','payroll.manage','banking.manage','taxes.export','health.manage','gym.manage','communications.manage'];
  for(const key of permissionKeys)await prisma.permission.upsert({where:{key},update:{},create:{key,description:`Permiso ${key}`}});
  const role=await prisma.role.upsert({where:{tenantId_name:{tenantId,name:'Administrador'}},update:{description:'Rol administrador de ContaGest.',system:true},create:{tenantId,name:'Administrador',description:'Rol administrador de ContaGest.',system:true}});
  const permissions=await prisma.permission.findMany({where:{key:{in:permissionKeys}},select:{id:true}});
  for(const permission of permissions)await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}},update:{},create:{roleId:role.id,permissionId:permission.id}});
  await prisma.userRole.upsert({where:{userId_roleId:{userId,roleId:role.id}},update:{},create:{userId,roleId:role.id}});
}

function bearerToken(req:any){const header=String(req.header('authorization')||''),[kind,token]=header.trim().split(/\s+/,2);if(kind?.toLowerCase()!=='bearer'||!token)throw new HttpError(401,'Token requerido.');return token;}
async function authenticatedSession(req:any){
  let decoded:any;try{decoded=verifyAccessToken(bearerToken(req));}catch{throw new HttpError(401,'Token inválido o expirado.');}
  const user=await prisma.userProfile.findFirst({where:{id:decoded.sub,tenantId:decoded.tenantId,status:'active'},include:{tenant:true,userRoles:userRoleInclude}});
  if(!user)throw new HttpError(401,'Usuario no encontrado o deshabilitado.');ensureAccessNotExpired(user);return{decoded,user};
}

router.get('/captcha',(_req,res)=>ok(res,createCaptchaChallenge()));

router.post('/register',validateBody(registerSchema),asyncHandler(async(req,res)=>{
  const registerKey=req.header('x-admin-register-key')||'',publicAllowed=env.ALLOW_PUBLIC_REGISTER==='true'||(!isProd&&env.ALLOW_PUBLIC_REGISTER==='local'),keyAllowed=Boolean(env.ADMIN_REGISTER_KEY&&registerKey===env.ADMIN_REGISTER_KEY);
  if(!publicAllowed&&!keyAllowed)throw new HttpError(403,'Registro público deshabilitado. La empresa debe ser creada por un administrador.');
  verifyCaptcha(req.body);const body=req.body,passwordHash=await bcrypt.hash(body.password,12);
  const tenant=await prisma.tenant.upsert({where:{rif:body.tenantRif},update:{name:body.tenantName,legalName:body.legalName||body.tenantName,plan:body.plan||'enterprise',status:'active'},create:{rif:body.tenantRif,name:body.tenantName,legalName:body.legalName||body.tenantName,plan:body.plan||'enterprise',status:'active',settings:{}}});
  const existing=await prisma.userProfile.findUnique({where:{tenantId_email:{tenantId:tenant.id,email:body.email}}});
  if(existing?.passwordHash)throw new HttpError(409,'Ya existe un usuario con ese email para esta empresa.');
  const user=existing?await prisma.userProfile.update({where:{id:existing.id},data:{fullName:body.fullName,passwordHash,status:'active'}}):await prisma.userProfile.create({data:{tenantId:tenant.id,email:body.email,fullName:body.fullName,passwordHash,status:'active'}});
  await ensureAdminRole(tenant.id,user.id);
  const sessionUser=await prisma.userProfile.findUnique({where:{id:user.id},include:{userRoles:userRoleInclude}});
  ok(res,buildSession(sessionUser||user,tenant,{role:'admin'}),201);
}));

router.post('/login',validateBody(loginSchema),asyncHandler(async(req,res)=>{
  verifyCaptcha(req.body);
  const tenant=await prisma.tenant.findUnique({where:{rif:req.body.tenantRif}});
  if(!tenant){await recordLoginFailure(req);throw new HttpError(401,'Credenciales incorrectas.');}

  const user=await prisma.userProfile.findFirst({where:{tenantId:tenant.id,email:req.body.email},include:{userRoles:userRoleInclude}});
  if(!user){await recordLoginFailure(req);throw new HttpError(401,'Credenciales incorrectas.');}
  if(user.status==='disabled')throw new HttpError(423,'Usuario bloqueado. Comunícate con un administrador para reactivarlo.');
  if(user.status!=='active')throw new HttpError(403,'El usuario todavía no está activo. Comunícate con un administrador.');

  ensureAccessNotExpired(user);
  const valid=Boolean(user.passwordHash)&&await bcrypt.compare(req.body.password,user.passwordHash);
  if(!valid){
    const failures=await recordLoginFailure(req,user.id);
    if(failures>=LOGIN_FAILURE_LIMIT)throw new HttpError(423,'Usuario bloqueado después de 5 intentos fallidos. Comunícate con un administrador.');
    const remaining=Math.max(0,LOGIN_FAILURE_LIMIT-failures);
    throw new HttpError(401,`Credenciales incorrectas. Quedan ${remaining} intento(s) antes del bloqueo.`);
  }

  const internalUser=isInternalUser(user);
  if(req.body.accessMode==='client'&&internalUser){
    throw new HttpError(403,'Esta cuenta pertenece al equipo interno. Usa el acceso interno de ContaGest.');
  }
  if(req.body.accessMode==='staff'&&!internalUser){
    throw new HttpError(403,'Esta cuenta requiere el portal Cliente con licencia.');
  }

  await recordLoginSuccess(req);
  let license=null;
  if(!internalUser){
    if(!req.body.licenseKey||!req.body.deviceId)throw new HttpError(403,'Este usuario requiere licencia y dispositivo autorizado.');
    license=await validateUserLicense({tenantId:tenant.id,userId:user.id,userEmail:user.email,licenseKey:req.body.licenseKey,deviceId:req.body.deviceId,deviceLabel:req.body.deviceLabel||null,route:'login',ip:req.ip,userAgent:req.headers['user-agent']||null,metadata:{source:'login',accessMode:req.body.accessMode}});
  }
  const role=roleForUser(user);
  const mfa=await issueCoordinateChallenge({tenantId:tenant.id,userId:user.id,ip:req.ip,userAgent:req.headers['user-agent']||'',context:{role,license}});
  if(mfa)return ok(res,{...mfa,user:{email:user.email,fullName:user.fullName},tenant:{id:tenant.id,name:tenant.name,rif:tenant.rif}},202);
  ok(res,buildSession(user,tenant,{role,license}));
}));

router.post('/login/coordinates',validateBody(coordinateLoginSchema),asyncHandler(async(req,res)=>{
  const verified=await verifyCoordinateChallenge({challengeId:req.body.challengeId,answers:req.body.answers,ip:req.ip,userAgent:req.headers['user-agent']||''});
  const user=await prisma.userProfile.findFirst({where:{id:verified.userId,tenantId:verified.tenantId,status:'active'},include:{tenant:true,userRoles:userRoleInclude}});if(!user)throw new HttpError(401,'Usuario del reto no disponible.');ensureAccessNotExpired(user);
  const context=verified.context as any;
  ok(res,buildSession(user,user.tenant,{role:context.role||roleForUser(user),license:context.license||null}));
}));

router.get('/coordinates/status',asyncHandler(async(req,res)=>{const{user}=await authenticatedSession(req);ok(res,await coordinateCardStatus(user.tenantId,user.id));}));
router.post('/coordinates/enroll',asyncHandler(async(req,res)=>{const{user}=await authenticatedSession(req);ok(res,await generateCoordinateCard(user.tenantId,user.id),201);}));
router.post('/coordinates/revoke',asyncHandler(async(req,res)=>{const{user}=await authenticatedSession(req);ok(res,await revokeCoordinateCard(user.tenantId,user.id));}));
router.get('/me',asyncHandler(async(req,res)=>{const{decoded,user}=await authenticatedSession(req);ok(res,{...decoded,user:publicUser(user),tenant:user.tenant,tenantId:user.tenantId,coordinateCard:await coordinateCardStatus(user.tenantId,user.id)});}));
router.post('/refresh',asyncHandler(async(req,res)=>{const{user}=await authenticatedSession(req);ok(res,buildSession(user,user.tenant));}));

export default router;
