import {Router} from 'express';
import {z} from 'zod';
import {prisma} from '../../database/prisma.js';
import {asyncHandler,HttpError,ok} from '../../shared/http.js';
import {requireTenant} from '../../shared/middleware/context.js';
import {currentLegalDocuments,legalProductionReady,legalProvider} from '../../shared/legal/legalCatalog.js';
import {isProd} from '../../config/env.js';

const router=Router();

// Public, read-only catalog used from the login screen. It deliberately exposes
// only the canonical current policies and provider identity; acceptance evidence,
// cookie preferences, tenant ids and user ids remain behind requireTenant.
router.get('/public',(_req,res)=>{
  ok(res,{productionReady:legalProductionReady(),provider:legalProvider(),documents:currentLegalDocuments()});
});

router.use(requireTenant);

const acceptSchema=z.object({
  documents:z.array(z.object({code:z.string().min(1).max(80),version:z.string().min(1).max(80),hash:z.string().regex(/^[a-f0-9]{64}$/)})).min(1).max(20),
  necessaryCookiesAcknowledged:z.literal(true),
  analyticsCookies:z.boolean().default(false),
  marketingCookies:z.boolean().default(false),
  locale:z.string().trim().min(2).max(20).default('es-VE')
});
const preferenceSchema=z.object({analyticsCookies:z.boolean(),marketingCookies:z.boolean().default(false)});

function context(req:any){
  const ctx=req.context as {tenantId?:string;userId?:string};
  if(!ctx?.tenantId||!ctx.userId)throw new HttpError(401,'No hay una sesión autenticada para registrar aceptación legal.');
  return {tenantId:ctx.tenantId,userId:ctx.userId};
}

async function accountUserIdFor(userId:string){
  const rows=await prisma.$queryRaw<Array<{accountUserId:string}>>`SELECT "accountUserId" FROM public."TenantMembership" WHERE "userProfileId"=${userId} LIMIT 1`;
  return rows[0]?.accountUserId||null;
}

router.get('/status',asyncHandler(async(req,res)=>{
  const ctx=context(req);
  const documents=currentLegalDocuments();
  const accepted=await prisma.$queryRaw<Array<{documentCode:string;documentVersion:string;documentHash:string;acceptedAt:Date}>>`
    SELECT "documentCode","documentVersion","documentHash","acceptedAt"
    FROM public."LegalAcceptance" WHERE "tenantId"=${ctx.tenantId} AND "userId"=${ctx.userId}
  `;
  const acceptedKeys=new Set(accepted.map((row)=>`${row.documentCode}:${row.documentVersion}:${row.documentHash}`));
  const pending=documents.filter((doc)=>doc.required&&!acceptedKeys.has(`${doc.code}:${doc.version}:${doc.hash}`));
  const prefs=await prisma.$queryRaw<Array<{necessaryAcknowledged:boolean;analyticsEnabled:boolean;marketingEnabled:boolean;updatedAt:Date}>>`
    SELECT "necessaryAcknowledged","analyticsEnabled","marketingEnabled","updatedAt"
    FROM public."CookiePreference" WHERE "tenantId"=${ctx.tenantId} AND "userId"=${ctx.userId} LIMIT 1
  `;
  ok(res,{productionReady:legalProductionReady(),provider:legalProvider(),documents,pendingCodes:pending.map((doc)=>doc.code),accepted,pending:pending.length>0,cookiePreferences:prefs[0]||{necessaryAcknowledged:false,analyticsEnabled:false,marketingEnabled:false}});
}));

router.post('/accept',asyncHandler(async(req,res)=>{
  const ctx=context(req);const body=acceptSchema.parse(req.body||{});
  if(body.marketingCookies)throw new HttpError(422,'ContaGest no habilita cookies de marketing en esta versión.');
  if(isProd&&!legalProductionReady())throw new HttpError(503,'La identidad legal del proveedor debe configurarse antes de aceptar clientes en producción.');
  const catalog=currentLegalDocuments();const required=catalog.filter((doc)=>doc.required);
  const supplied=new Map(body.documents.map((item)=>[item.code,item]));
  for(const doc of required){const item=supplied.get(doc.code);if(!item||item.version!==doc.version||item.hash!==doc.hash)throw new HttpError(409,`Debes aceptar la versión vigente de ${doc.title}.`);}
  const accountUserId=await accountUserIdFor(ctx.userId);
  for(const doc of required){
    await prisma.$executeRaw`
      INSERT INTO public."LegalAcceptance" ("id","tenantId","userId","accountUserId","documentCode","documentVersion","documentHash","acceptedAt","acceptanceMethod","locale","ipAddress","userAgent","metadata","createdAt")
      VALUES (gen_random_uuid()::text,${ctx.tenantId},${ctx.userId},${accountUserId},${doc.code},${doc.version},${doc.hash},now(),'explicit-checkbox',${body.locale},${req.ip||null},${req.headers['user-agent']||null},${JSON.stringify({effectiveAt:doc.effectiveAt})}::jsonb,now())
      ON CONFLICT ("tenantId","userId","documentCode","documentVersion","documentHash") DO NOTHING
    `;
  }
  await prisma.$executeRaw`
    INSERT INTO public."CookiePreference" ("id","tenantId","userId","necessaryAcknowledged","analyticsEnabled","marketingEnabled","updatedAt","updatedIp","updatedUserAgent")
    VALUES (gen_random_uuid()::text,${ctx.tenantId},${ctx.userId},true,${body.analyticsCookies},false,now(),${req.ip||null},${req.headers['user-agent']||null})
    ON CONFLICT ("tenantId","userId") DO UPDATE SET "necessaryAcknowledged"=true,"analyticsEnabled"=EXCLUDED."analyticsEnabled","marketingEnabled"=false,"updatedAt"=now(),"updatedIp"=EXCLUDED."updatedIp","updatedUserAgent"=EXCLUDED."updatedUserAgent"
  `;
  await prisma.auditLog.create({data:{tenantId:ctx.tenantId,userId:ctx.userId,action:'legal.accept.current',entity:'LegalAcceptance',entityId:ctx.userId,after:{documents:required.map((d)=>({code:d.code,version:d.version,hash:d.hash})),analyticsCookies:body.analyticsCookies} as any,ipAddress:req.ip,userAgent:req.headers['user-agent']||null}});
  ok(res,{accepted:true,documents:required.map((doc)=>({code:doc.code,version:doc.version,hash:doc.hash})),cookiePreferences:{necessaryAcknowledged:true,analyticsEnabled:body.analyticsCookies,marketingEnabled:false}});
}));

router.patch('/cookie-preferences',asyncHandler(async(req,res)=>{
  const ctx=context(req);const body=preferenceSchema.parse(req.body||{});
  if(body.marketingCookies)throw new HttpError(422,'Las cookies de marketing no están disponibles.');
  const existing=await prisma.$queryRaw<Array<{id:string}>>`SELECT "id" FROM public."CookiePreference" WHERE "tenantId"=${ctx.tenantId} AND "userId"=${ctx.userId} LIMIT 1`;
  if(!existing[0])throw new HttpError(428,'Primero debes completar la aceptación inicial de cookies necesarias.');
  await prisma.$executeRaw`UPDATE public."CookiePreference" SET "analyticsEnabled"=${body.analyticsCookies},"marketingEnabled"=false,"updatedAt"=now(),"updatedIp"=${req.ip||null},"updatedUserAgent"=${req.headers['user-agent']||null} WHERE "id"=${existing[0].id}`;
  ok(res,{necessaryAcknowledged:true,analyticsEnabled:body.analyticsCookies,marketingEnabled:false});
}));

export default router;
