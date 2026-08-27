import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';

const router=Router();
router.use(requireTenant,requirePermission('platform.manage'));

const PLAN_TEMPLATES={
  vendedor:{
    label:'Vendedor / Comercio',segment:'sales',maxTenants:1,maxUsers:3,additionalTenantUnitPriceUsd:12,
    modules:['dashboard','ventas','cotizacion','clientes','inventario','kardex','reportes','analytics'],
    description:'Ventas, clientes, inventario, facturación operativa y reportes de control.'
  },
  contador:{
    label:'Contador Multiempresa',segment:'accounting',maxTenants:3,maxUsers:3,additionalTenantUnitPriceUsd:12,
    modules:['dashboard','contabilidad','plan-cuentas','libro-mayor','balance-sumas-saldos','hoja-trabajo','estados-financieros','cierre-contable','bancos','tributos','libro-ventas','reportes','analytics'],
    description:'Control contable y reportes por empresa, con aislamiento estricto entre RIF.'
  },
  pyme:{
    label:'PyME Integral',segment:'smb',maxTenants:1,maxUsers:5,additionalTenantUnitPriceUsd:12,
    modules:['dashboard','ventas','cotizacion','clientes','inventario','kardex','compras','proveedores','bancos','contabilidad','reportes','analytics'],
    description:'Operación comercial, inventario, bancos, contabilidad y reportes.'
  },
  profesional:{
    label:'Servicios Profesionales',segment:'professional',maxTenants:1,maxUsers:2,additionalTenantUnitPriceUsd:12,
    modules:['dashboard','cotizacion','clientes','ventas','reportes','analytics'],
    description:'Clientes, cotizaciones, facturación y seguimiento de ingresos.'
  }
} as const;

const OPTIONAL_PACKAGES={
  salud:{kind:'vertical',label:'Salud / práctica médica',modules:['salud']},
  veterinaria:{kind:'vertical',label:'Veterinaria',modules:['veterinaria']},
  fitness:{kind:'vertical',label:'Gimnasio / fitness',modules:['gimnasio','rutinas','nutricion']},
  restaurante:{kind:'vertical',label:'Restaurante',modules:['pedidos','pos-sede','tracking-pedidos','delivery-mapa']},
  email:{kind:'addon',label:'Correo transaccional',modules:['channel.email']},
  whatsapp:{kind:'addon',label:'WhatsApp',modules:['channel.whatsapp']},
  sms:{kind:'addon',label:'SMS',modules:['channel.sms']},
  ia:{kind:'addon',label:'Asistente IA',modules:['asistente-ia']}
} as const;

const SUBSCRIPTION_STATUSES=['trial','active','past_due','suspended','cancelled','expired'] as const;
type SubscriptionStatus=(typeof SUBSCRIPTION_STATUSES)[number];
const ALLOWED_SUBSCRIPTION_TRANSITIONS:Record<SubscriptionStatus,SubscriptionStatus[]>={
  trial:['active','cancelled','expired'],
  active:['past_due','suspended','cancelled','expired'],
  past_due:['active','suspended','cancelled','expired'],
  suspended:['active','cancelled','expired'],
  cancelled:[],
  expired:[]
};

const customerSchema=z.object({
  legalName:z.string().trim().min(2).max(180),rif:z.string().trim().max(40).optional(),contactName:z.string().trim().max(120).optional(),
  email:z.string().email().optional(),phone:z.string().trim().max(60).optional(),segment:z.string().trim().max(50).default('smb'),
  status:z.enum(['prospect','trial','active','past_due','suspended','cancelled']).default('prospect'),notes:z.string().trim().max(2000).optional()
});
const agentSchema=z.object({name:z.string().trim().min(2).max(120),email:z.string().email().optional(),phone:z.string().trim().max(60).optional(),commissionRate:z.coerce.number().min(0).max(100).default(10),notes:z.string().trim().max(1000).optional()});
const subscriptionSchema=z.object({
  customerAccountId:z.string().min(1).max(120),salesAgentId:z.string().min(1).max(120).optional(),planCode:z.string().trim().min(2).max(80),
  customerSegment:z.string().trim().max(80).default('smb'),billingCycle:z.enum(['monthly','quarterly','semiannual','annual','manual']).default('monthly'),
  currency:z.string().trim().min(3).max(8).default('USD'),amount:z.coerce.number().min(0).default(0),status:z.enum(SUBSCRIPTION_STATUSES).default('trial'),
  startsAt:z.coerce.date().optional(),nextRenewalAt:z.coerce.date().optional(),graceUntil:z.coerce.date().optional(),maxTenants:z.coerce.number().int().min(1).max(1000).default(1),maxUsers:z.coerce.number().int().min(1).max(100000).default(3),
  supportLevel:z.string().trim().max(50).default('standard'),modules:z.array(z.string().min(1).max(100)).default([]),packages:z.array(z.string().min(1).max(80)).default([]),additionalTenantUnitPriceUsd:z.coerce.number().min(0).default(12)
});
const patchSubscriptionSchema=z.object({
  planCode:z.string().trim().min(2).max(80).optional(),salesAgentId:z.string().min(1).max(120).nullable().optional(),customerSegment:z.string().trim().max(80).optional(),
  billingCycle:z.enum(['monthly','quarterly','semiannual','annual','manual']).optional(),currency:z.string().trim().min(3).max(8).optional(),amount:z.coerce.number().min(0).optional(),
  nextRenewalAt:z.coerce.date().nullable().optional(),graceUntil:z.coerce.date().nullable().optional(),maxTenants:z.coerce.number().int().min(1).max(1000).optional(),maxUsers:z.coerce.number().int().min(1).max(100000).optional(),supportLevel:z.string().trim().max(50).optional()
}).strict();
const subscriptionStatusSchema=z.object({status:z.enum(SUBSCRIPTION_STATUSES),reason:z.string().trim().min(3).max(500)}).strict();
const subscriptionFilterSchema=z.object({
  q:z.string().trim().max(160).optional(),planCode:z.string().trim().max(80).optional(),salesAgentId:z.string().trim().max(120).optional(),status:z.enum(SUBSCRIPTION_STATUSES).optional(),vertical:z.string().trim().max(100).optional(),limit:z.coerce.number().int().min(1).max(1000).default(1000)
});
const attachTenantSchema=z.object({tenantId:z.string().min(1).max(120).optional(),tenantRif:z.string().trim().min(4).max(40).optional(),tenantName:z.string().trim().min(2).max(160).optional(),legalName:z.string().trim().max(180).optional(),createIfMissing:z.boolean().default(false),priceOverride:z.coerce.number().min(0).nullable().optional()}).refine(v=>Boolean(v.tenantId||v.tenantRif),{message:'Indica tenantId o RIF.'});
const entitlementsSchema=z.object({modules:z.array(z.object({moduleCode:z.string().min(1).max(100),kind:z.enum(['core','vertical','addon']).default('core'),quantity:z.coerce.number().int().min(1).max(10000).default(1)})).max(200),replace:z.boolean().default(true)});
const paymentSchema=z.object({subscriptionId:z.string().min(1).max(120),amount:z.coerce.number().min(0),currency:z.string().trim().min(3).max(8).default('USD'),method:z.string().trim().max(80).optional(),reference:z.string().trim().max(160).optional(),status:z.enum(['pending','paid','failed','refunded','void']).default('paid'),paidAt:z.coerce.date().optional(),periodStart:z.coerce.date().optional(),periodEnd:z.coerce.date().optional()});
const commissionStatusSchema=z.object({status:z.enum(['paid','void']),reason:z.string().trim().min(3).max(500)}).strict();

function addCycle(date:Date,cycle:string){const next=new Date(date);if(cycle==='monthly')next.setUTCMonth(next.getUTCMonth()+1);else if(cycle==='quarterly')next.setUTCMonth(next.getUTCMonth()+3);else if(cycle==='semiannual')next.setUTCMonth(next.getUTCMonth()+6);else if(cycle==='annual')next.setUTCFullYear(next.getUTCFullYear()+1);return next;}

async function audit(req:any,action:string,entity:string,entityId:string,after:unknown,before?:unknown){const ctx=req.context;await prisma.auditLog.create({data:{tenantId:ctx.tenantId,userId:ctx.userId||null,action,entity,entityId,before:before===undefined?undefined:before as any,after:after as any,ipAddress:req.ip,userAgent:req.headers['user-agent']||null}});}

async function subscriptionRow(id:string){const rows=await prisma.$queryRaw<any[]>`
  SELECT s.*, ca."legalName" AS "customerName", ca."rif" AS "customerRif", sa."name" AS "salesAgentName", sa."commissionRate",
    COALESCE((SELECT jsonb_agg(jsonb_build_object('tenantId',st."tenantId",'status',st."status",'priceOverride',st."priceOverride",'rif',t."rif",'name',t."name") ORDER BY t."name") FROM public."SubscriptionTenant" st JOIN public."Tenant" t ON t."id"=st."tenantId" WHERE st."subscriptionId"=s."id"),'[]'::jsonb) AS tenants,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('moduleCode',me."moduleCode",'kind',me."kind",'status',me."status",'quantity',me."quantity") ORDER BY me."kind",me."moduleCode") FROM public."ModuleEntitlement" me WHERE me."subscriptionId"=s."id"),'[]'::jsonb) AS modules
  FROM public."Subscription" s JOIN public."CustomerAccount" ca ON ca."id"=s."customerAccountId" LEFT JOIN public."SalesAgent" sa ON sa."id"=s."salesAgentId" WHERE s."id"=${id} LIMIT 1`;
  return rows[0]||null;
}

router.get('/plans',(_req,res)=>ok(res,{plans:PLAN_TEMPLATES,optionalPackages:OPTIONAL_PACKAGES}));

router.get('/summary',asyncHandler(async(_req,res)=>{
  const rows=await prisma.$queryRaw<any[]>`
    SELECT
      count(*) FILTER (WHERE "status"='active')::int AS "activeSubscriptions",
      count(*) FILTER (WHERE "status"='trial')::int AS trials,
      count(*) FILTER (WHERE "status"='past_due')::int AS "pastDue",
      count(*) FILTER (WHERE "status"='suspended')::int AS suspended,
      count(*) FILTER (WHERE "status"='expired')::int AS expired,
      count(*) FILTER (WHERE "status"='cancelled')::int AS cancelled,
      count(*) FILTER (WHERE "status" IN ('cancelled','expired'))::int AS inactive,
      COALESCE(sum(CASE WHEN "status" IN ('active','past_due') THEN CASE "billingCycle" WHEN 'monthly' THEN "amount" WHEN 'quarterly' THEN "amount"/3 WHEN 'semiannual' THEN "amount"/6 WHEN 'annual' THEN "amount"/12 ELSE 0 END ELSE 0 END),0)::numeric AS mrr,
      count(*) FILTER (WHERE "nextRenewalAt" >= now() AND "nextRenewalAt" < now()+interval '7 days')::int AS "renew7",
      count(*) FILTER (WHERE "nextRenewalAt" >= now() AND "nextRenewalAt" < now()+interval '15 days')::int AS "renew15",
      count(*) FILTER (WHERE "nextRenewalAt" >= now() AND "nextRenewalAt" < now()+interval '30 days')::int AS "renew30"
    FROM public."Subscription"`;
  const customerRows=await prisma.$queryRaw<any[]>`
    SELECT count(*) FILTER (WHERE "status"<>'cancelled')::int AS customers,
      count(*) FILTER (WHERE "status"='active')::int AS "activeCustomers",
      count(*) FILTER (WHERE "status"='trial')::int AS "trialCustomers",
      count(*) FILTER (WHERE "status"='past_due')::int AS "pastDueCustomers",
      count(*) FILTER (WHERE "status"='suspended')::int AS "suspendedCustomers"
    FROM public."CustomerAccount"`;
  const tenants=await prisma.$queryRaw<Array<{count:number}>>`SELECT count(*)::int AS count FROM public."SubscriptionTenant" WHERE "status"='active'`;
  ok(res,{...(rows[0]||{}),...(customerRows[0]||{}),coveredCompanies:Number(tenants[0]?.count||0)});
}));

router.get('/customers',asyncHandler(async(_req,res)=>{const rows=await prisma.$queryRaw<any[]>`
  SELECT ca.*, COALESCE((SELECT count(*)::int FROM public."Subscription" s WHERE s."customerAccountId"=ca."id" AND s."status" NOT IN ('cancelled','expired')),0) AS "subscriptionCount"
  FROM public."CustomerAccount" ca ORDER BY ca."updatedAt" DESC LIMIT 1000`;ok(res,rows);}));
router.post('/customers',asyncHandler(async(req,res)=>{const b=customerSchema.parse(req.body||{});const rows=await prisma.$queryRaw<any[]>`
  INSERT INTO public."CustomerAccount" ("id","legalName","rif","contactName","email","phone","segment","status","notes","metadata","createdAt","updatedAt") VALUES (gen_random_uuid()::text,${b.legalName},${b.rif||null},${b.contactName||null},${b.email||null},${b.phone||null},${b.segment},${b.status},${b.notes||null},'{}'::jsonb,now(),now()) RETURNING *`;const row=rows[0];await audit(req,'commercial.customer.create','CustomerAccount',row.id,row);ok(res,row,201);}));

router.get('/agents',asyncHandler(async(_req,res)=>{ok(res,await prisma.$queryRaw<any[]>`SELECT * FROM public."SalesAgent" ORDER BY "status", "name"`);}));
router.post('/agents',asyncHandler(async(req,res)=>{const b=agentSchema.parse(req.body||{});const rows=await prisma.$queryRaw<any[]>`
  INSERT INTO public."SalesAgent" ("id","name","email","phone","commissionRate","status","notes","createdAt","updatedAt") VALUES (gen_random_uuid()::text,${b.name},${b.email||null},${b.phone||null},${b.commissionRate},'active',${b.notes||null},now(),now()) RETURNING *`;const row=rows[0];await audit(req,'commercial.agent.create','SalesAgent',row.id,row);ok(res,row,201);}));

router.get('/subscriptions',asyncHandler(async(req,res)=>{
  const filters=subscriptionFilterSchema.parse(req.query||{});
  const ids=await prisma.$queryRaw<Array<{id:string}>>`SELECT "id" FROM public."Subscription" ORDER BY "updatedAt" DESC LIMIT 1000`;
  let rows=(await Promise.all(ids.map(i=>subscriptionRow(i.id)))).filter(Boolean);
  if(filters.q){const q=filters.q.toLowerCase();rows=rows.filter((s:any)=>[s.customerName,s.customerRif,s.planCode,s.salesAgentName].some(value=>String(value||'').toLowerCase().includes(q)));}
  if(filters.planCode)rows=rows.filter((s:any)=>String(s.planCode)===filters.planCode);
  if(filters.salesAgentId)rows=rows.filter((s:any)=>String(s.salesAgentId||'')===filters.salesAgentId);
  if(filters.status)rows=rows.filter((s:any)=>String(s.status)===filters.status);
  if(filters.vertical)rows=rows.filter((s:any)=>Array.isArray(s.modules)&&s.modules.some((m:any)=>m.status==='active'&&(m.moduleCode===filters.vertical||m.kind==='vertical'&&m.moduleCode.includes(filters.vertical!))));
  ok(res,rows.slice(0,filters.limit));
}));
router.post('/subscriptions',asyncHandler(async(req,res)=>{
  const b=subscriptionSchema.parse(req.body||{});const customer=await prisma.$queryRaw<any[]>`SELECT "id" FROM public."CustomerAccount" WHERE "id"=${b.customerAccountId} LIMIT 1`;if(!customer[0])throw new HttpError(404,'Cliente comercial no encontrado.');
  if(b.salesAgentId){const agent=await prisma.$queryRaw<any[]>`SELECT "id" FROM public."SalesAgent" WHERE "id"=${b.salesAgentId} AND "status"='active' LIMIT 1`;if(!agent[0])throw new HttpError(404,'Vendedor activo no encontrado.');}
  const template=(PLAN_TEMPLATES as any)[b.planCode];const modules=b.modules.length?b.modules:(template?.modules||[]);const maxTenants=b.maxTenants||(template?.maxTenants||1);const maxUsers=b.maxUsers||(template?.maxUsers||3);
  const startsAt=b.startsAt||new Date();const rows=await prisma.$queryRaw<any[]>`
    INSERT INTO public."Subscription" ("id","customerAccountId","salesAgentId","planCode","customerSegment","billingCycle","currency","amount","status","startsAt","nextRenewalAt","graceUntil","maxTenants","maxUsers","supportLevel","metadata","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,${b.customerAccountId},${b.salesAgentId||null},${b.planCode},${b.customerSegment},${b.billingCycle},${b.currency.toUpperCase()},${b.amount},${b.status},${startsAt},${b.nextRenewalAt||null},${b.graceUntil||null},${maxTenants},${maxUsers},${b.supportLevel},${JSON.stringify({additionalTenantUnitPriceUsd:b.additionalTenantUnitPriceUsd,packages:b.packages})}::jsonb,now(),now()) RETURNING *`;
  const sub=rows[0];const entries:Array<{moduleCode:string;kind:string}>=modules.map((moduleCode:string)=>({moduleCode,kind:'core'}));for(const packageKey of b.packages){const pkg=(OPTIONAL_PACKAGES as any)[packageKey];if(pkg)for(const moduleCode of pkg.modules)entries.push({moduleCode,kind:pkg.kind});}
  for(const item of [...new Map(entries.map(item=>[item.moduleCode,item])).values()])await prisma.$executeRaw`INSERT INTO public."ModuleEntitlement" ("id","subscriptionId","moduleCode","kind","status","quantity","metadata","createdAt","updatedAt") VALUES (gen_random_uuid()::text,${sub.id},${item.moduleCode},${item.kind},'active',1,'{}'::jsonb,now(),now()) ON CONFLICT ("subscriptionId","moduleCode") DO UPDATE SET "kind"=EXCLUDED."kind","status"='active',"updatedAt"=now()`;
  await prisma.$executeRaw`UPDATE public."CustomerAccount" SET "status"=CASE WHEN ${b.status}='trial' THEN 'trial' ELSE 'active' END,"updatedAt"=now() WHERE "id"=${b.customerAccountId}`;
  const result=await subscriptionRow(sub.id);await audit(req,'commercial.subscription.create','Subscription',sub.id,result);ok(res,result,201);
}));

router.patch('/subscriptions/:id',asyncHandler(async(req,res)=>{
  const b=patchSubscriptionSchema.parse(req.body||{});
  const current=await subscriptionRow(req.params.id);
  if(!current)throw new HttpError(404,'Suscripción no encontrada.');
  if(b.salesAgentId){const agent=await prisma.$queryRaw<any[]>`SELECT "id" FROM public."SalesAgent" WHERE "id"=${b.salesAgentId} AND "status"='active' LIMIT 1`;if(!agent[0])throw new HttpError(404,'Vendedor activo no encontrado.');}
  const activeTenantCount=Array.isArray(current.tenants)?current.tenants.filter((item:any)=>item.status==='active').length:0;
  if(b.maxTenants!==undefined&&b.maxTenants<activeTenantCount)throw new HttpError(409,`No puedes reducir el límite a ${b.maxTenants}: la suscripción tiene ${activeTenantCount} empresa(s) activa(s). Retira empresas primero.`);
  const next={
    planCode:b.planCode??current.planCode,salesAgentId:b.salesAgentId===undefined?current.salesAgentId:b.salesAgentId,customerSegment:b.customerSegment??current.customerSegment,
    billingCycle:b.billingCycle??current.billingCycle,currency:(b.currency??current.currency).toUpperCase(),amount:b.amount??Number(current.amount),
    nextRenewalAt:b.nextRenewalAt===undefined?current.nextRenewalAt:b.nextRenewalAt,graceUntil:b.graceUntil===undefined?current.graceUntil:b.graceUntil,
    maxTenants:b.maxTenants??Number(current.maxTenants),maxUsers:b.maxUsers??Number(current.maxUsers),supportLevel:b.supportLevel??current.supportLevel
  };
  await prisma.$executeRaw`UPDATE public."Subscription" SET "planCode"=${next.planCode},"salesAgentId"=${next.salesAgentId},"customerSegment"=${next.customerSegment},"billingCycle"=${next.billingCycle},"currency"=${next.currency},"amount"=${next.amount},"nextRenewalAt"=${next.nextRenewalAt},"graceUntil"=${next.graceUntil},"maxTenants"=${next.maxTenants},"maxUsers"=${next.maxUsers},"supportLevel"=${next.supportLevel},"updatedAt"=now() WHERE "id"=${req.params.id}`;
  const result=await subscriptionRow(req.params.id);
  await audit(req,'commercial.subscription.update','Subscription',req.params.id,result,current);
  ok(res,result);
}));

router.post('/subscriptions/:id/status',asyncHandler(async(req,res)=>{
  const b=subscriptionStatusSchema.parse(req.body||{});
  const current=await subscriptionRow(req.params.id);
  if(!current)throw new HttpError(404,'Suscripción no encontrada.');
  const currentStatus=String(current.status) as SubscriptionStatus;
  const nextStatus=b.status as SubscriptionStatus;
  if(currentStatus===nextStatus)throw new HttpError(409,`La suscripción ya está en estado ${nextStatus}.`);
  if(!ALLOWED_SUBSCRIPTION_TRANSITIONS[currentStatus]?.includes(nextStatus))throw new HttpError(409,`Transición de suscripción no permitida: ${currentStatus} → ${nextStatus}. Cancelled/expired son terminales; para reactivar crea una nueva suscripción.`);
  await prisma.$executeRaw`UPDATE public."Subscription" SET "status"=${nextStatus},"updatedAt"=now() WHERE "id"=${req.params.id}`;
  if(nextStatus==='active'||nextStatus==='trial')await prisma.$executeRaw`UPDATE public."CustomerAccount" SET "status"=${nextStatus},"updatedAt"=now() WHERE "id"=${current.customerAccountId}`;
  if(nextStatus==='past_due'||nextStatus==='suspended')await prisma.$executeRaw`UPDATE public."CustomerAccount" SET "status"=${nextStatus},"updatedAt"=now() WHERE "id"=${current.customerAccountId}`;
  const result=await subscriptionRow(req.params.id);
  await audit(req,'commercial.subscription.status','Subscription',req.params.id,{...result,statusReason:b.reason},current);
  ok(res,result);
}));

router.post('/subscriptions/:id/tenants',asyncHandler(async(req,res)=>{const b=attachTenantSchema.parse(req.body||{});const subscription=await subscriptionRow(req.params.id);if(!subscription)throw new HttpError(404,'Suscripción no encontrada.');let tenant:any=null;if(b.tenantId)tenant=await prisma.tenant.findUnique({where:{id:b.tenantId}});if(!tenant&&b.tenantRif)tenant=await prisma.tenant.findUnique({where:{rif:b.tenantRif}});if(!tenant&&b.createIfMissing&&b.tenantRif&&b.tenantName)tenant=await prisma.tenant.create({data:{rif:b.tenantRif,name:b.tenantName,legalName:b.legalName||b.tenantName,plan:'commercial',status:'active',settings:{}}});if(!tenant)throw new HttpError(404,'Empresa/RIF no encontrado. Activa createIfMissing e indica nombre para crearla.');try{await prisma.$executeRaw`INSERT INTO public."SubscriptionTenant" ("id","subscriptionId","tenantId","status","priceOverride","createdAt","updatedAt") VALUES (gen_random_uuid()::text,${req.params.id},${tenant.id},'active',${b.priceOverride??null},now(),now()) ON CONFLICT ("subscriptionId","tenantId") DO UPDATE SET "status"='active',"priceOverride"=EXCLUDED."priceOverride","updatedAt"=now()`;}catch(error:any){if(String(error?.message||'').includes('subscription_tenant_limit_reached'))throw new HttpError(409,'La suscripción alcanzó su máximo de empresas. Amplía el plan antes de añadir otro RIF.');throw error;}const result=await subscriptionRow(req.params.id);await audit(req,'commercial.subscription.tenant.add','Subscription',req.params.id,{tenantId:tenant.id,rif:tenant.rif});ok(res,result);}));
router.patch('/subscriptions/:id/tenants/:tenantId/remove',asyncHandler(async(req,res)=>{const before=await subscriptionRow(req.params.id);if(!before)throw new HttpError(404,'Suscripción no encontrada.');await prisma.$executeRaw`UPDATE public."SubscriptionTenant" SET "status"='removed',"updatedAt"=now() WHERE "subscriptionId"=${req.params.id} AND "tenantId"=${req.params.tenantId}`;const result=await subscriptionRow(req.params.id);await audit(req,'commercial.subscription.tenant.remove','Subscription',req.params.id,{tenantId:req.params.tenantId,result},before);ok(res,result);}));

router.put('/subscriptions/:id/modules',asyncHandler(async(req,res)=>{const b=entitlementsSchema.parse(req.body||{});const before=await subscriptionRow(req.params.id);if(!before)throw new HttpError(404,'Suscripción no encontrada.');if(b.replace)await prisma.$executeRaw`UPDATE public."ModuleEntitlement" SET "status"='removed',"updatedAt"=now() WHERE "subscriptionId"=${req.params.id}`;for(const m of b.modules)await prisma.$executeRaw`INSERT INTO public."ModuleEntitlement" ("id","subscriptionId","moduleCode","kind","status","quantity","metadata","createdAt","updatedAt") VALUES (gen_random_uuid()::text,${req.params.id},${m.moduleCode},${m.kind},'active',${m.quantity},'{}'::jsonb,now(),now()) ON CONFLICT ("subscriptionId","moduleCode") DO UPDATE SET "kind"=EXCLUDED."kind","quantity"=EXCLUDED."quantity","status"='active',"updatedAt"=now()`;const result=await subscriptionRow(req.params.id);await audit(req,'commercial.subscription.modules','Subscription',req.params.id,result?.modules||[],before?.modules||[]);ok(res,result);}));

router.get('/renewals',asyncHandler(async(req,res)=>{const days=Math.min(90,Math.max(1,Number(req.query.days||30)));const rows=await prisma.$queryRaw<any[]>`SELECT s."id",s."planCode",s."amount",s."currency",s."billingCycle",s."status",s."nextRenewalAt",s."graceUntil",ca."legalName" AS "customerName",ca."rif" AS "customerRif",sa."name" AS "salesAgentName" FROM public."Subscription" s JOIN public."CustomerAccount" ca ON ca."id"=s."customerAccountId" LEFT JOIN public."SalesAgent" sa ON sa."id"=s."salesAgentId" WHERE s."status" IN ('trial','active','past_due') AND s."nextRenewalAt" IS NOT NULL AND s."nextRenewalAt" >= now() AND s."nextRenewalAt" < now()+(${days}::text||' days')::interval ORDER BY s."nextRenewalAt" ASC`;ok(res,rows);}));

router.get('/payments',asyncHandler(async(req,res)=>{const limit=Math.min(1000,Math.max(1,Number(req.query.limit||250)));ok(res,await prisma.$queryRaw<any[]>`SELECT p.*,s."planCode",ca."legalName" AS "customerName",ca."rif" AS "customerRif" FROM public."SubscriptionPayment" p JOIN public."Subscription" s ON s."id"=p."subscriptionId" JOIN public."CustomerAccount" ca ON ca."id"=s."customerAccountId" ORDER BY p."createdAt" DESC LIMIT ${limit}`);}));
router.post('/payments',asyncHandler(async(req,res)=>{
  const b=paymentSchema.parse(req.body||{});
  const subscription=await subscriptionRow(b.subscriptionId);
  if(!subscription)throw new HttpError(404,'Suscripción no encontrada.');
  if(b.status==='paid'&&['cancelled','expired'].includes(String(subscription.status)))throw new HttpError(409,'Una suscripción cancelada o expirada no puede reactivarse mediante un pago. Crea una nueva suscripción y registra el pago allí.');
  if(b.status==='paid'&&b.amount<=0)throw new HttpError(422,'Un pago marcado como pagado debe tener un monto mayor que cero.');
  const paidAt=b.status==='paid'?(b.paidAt||new Date()):null;
  const periodStart=b.periodStart||(b.status==='paid'?new Date():null);
  const periodEnd=b.periodEnd||(periodStart&&subscription.billingCycle!=='manual'?addCycle(new Date(periodStart),subscription.billingCycle):null);
  const rows=await prisma.$queryRaw<any[]>`INSERT INTO public."SubscriptionPayment" ("id","subscriptionId","amount","currency","method","reference","status","periodStart","periodEnd","paidAt","metadata","createdAt","updatedAt") VALUES (gen_random_uuid()::text,${b.subscriptionId},${b.amount},${b.currency.toUpperCase()},${b.method||null},${b.reference||null},${b.status},${periodStart},${periodEnd},${paidAt},'{}'::jsonb,now(),now()) RETURNING *`;
  const payment=rows[0];
  if(b.status==='paid'){
    const next=periodEnd||addCycle(new Date(paidAt!),subscription.billingCycle);
    await prisma.$executeRaw`UPDATE public."Subscription" SET "status"='active',"currentPeriodStart"=${periodStart},"currentPeriodEnd"=${periodEnd},"nextRenewalAt"=${next},"updatedAt"=now() WHERE "id"=${b.subscriptionId}`;
    await prisma.$executeRaw`UPDATE public."CustomerAccount" SET "status"='active',"updatedAt"=now() WHERE "id"=${subscription.customerAccountId}`;
    if(subscription.salesAgentId){
      const existing=await prisma.$queryRaw<Array<{id:string}>>`SELECT "id" FROM public."Commission" WHERE "paymentId"=${payment.id} LIMIT 1`;
      if(!existing[0]){const rate=Number(subscription.commissionRate||0),commissionAmount=Math.round((b.amount*rate/100)*100)/100;await prisma.$executeRaw`INSERT INTO public."Commission" ("id","salesAgentId","subscriptionId","paymentId","rate","baseAmount","amount","currency","status","earnedAt","createdAt","updatedAt") VALUES (gen_random_uuid()::text,${subscription.salesAgentId},${b.subscriptionId},${payment.id},${rate},${b.amount},${commissionAmount},${b.currency.toUpperCase()},'earned',now(),now(),now())`;}
    }
  }
  await audit(req,'commercial.payment.create','SubscriptionPayment',payment.id,payment);
  ok(res,{payment,subscription:await subscriptionRow(b.subscriptionId)},201);
}));

router.get('/commissions',asyncHandler(async(req,res)=>{const status=typeof req.query.status==='string'?req.query.status:'';const salesAgentId=typeof req.query.salesAgentId==='string'?req.query.salesAgentId:'';let rows=await prisma.$queryRaw<any[]>`SELECT c.*,sa."name" AS "salesAgentName",s."planCode",ca."legalName" AS "customerName",ca."rif" AS "customerRif" FROM public."Commission" c JOIN public."SalesAgent" sa ON sa."id"=c."salesAgentId" JOIN public."Subscription" s ON s."id"=c."subscriptionId" JOIN public."CustomerAccount" ca ON ca."id"=s."customerAccountId" ORDER BY c."createdAt" DESC LIMIT 1000`;if(status)rows=rows.filter(row=>String(row.status)===status);if(salesAgentId)rows=rows.filter(row=>String(row.salesAgentId)===salesAgentId);ok(res,rows);}));
router.post('/commissions/:id/status',asyncHandler(async(req,res)=>{
  const b=commissionStatusSchema.parse(req.body||{});
  const currentRows=await prisma.$queryRaw<any[]>`SELECT * FROM public."Commission" WHERE "id"=${req.params.id} LIMIT 1`;
  const current=currentRows[0];if(!current)throw new HttpError(404,'Comisión no encontrada.');
  if(current.status===b.status)throw new HttpError(409,`La comisión ya está en estado ${b.status}.`);
  if(b.status==='paid'&&current.status!=='earned')throw new HttpError(409,'Solo una comisión devengada puede marcarse como pagada.');
  if(b.status==='void'&&!['pending','earned'].includes(String(current.status)))throw new HttpError(409,'Solo una comisión pendiente o devengada puede anularse.');
  if(b.status==='paid')await prisma.$executeRaw`UPDATE public."Commission" SET "status"='paid',"paidAt"=COALESCE("paidAt",now()),"updatedAt"=now() WHERE "id"=${req.params.id}`;
  else await prisma.$executeRaw`UPDATE public."Commission" SET "status"='void',"updatedAt"=now() WHERE "id"=${req.params.id}`;
  const rows=await prisma.$queryRaw<any[]>`SELECT c.*,sa."name" AS "salesAgentName",s."planCode",ca."legalName" AS "customerName",ca."rif" AS "customerRif" FROM public."Commission" c JOIN public."SalesAgent" sa ON sa."id"=c."salesAgentId" JOIN public."Subscription" s ON s."id"=c."subscriptionId" JOIN public."CustomerAccount" ca ON ca."id"=s."customerAccountId" WHERE c."id"=${req.params.id} LIMIT 1`;
  const result=rows[0];await audit(req,'commercial.commission.status','Commission',req.params.id,{...result,statusReason:b.reason},current);ok(res,result);
}));

router.get('/activity',asyncHandler(async(req,res)=>{
  const ctx=(req as any).context;const limit=Math.min(250,Math.max(1,Number(req.query.limit||80)));
  const rows=await prisma.auditLog.findMany({where:{tenantId:ctx.tenantId,action:{startsWith:'commercial.'}},orderBy:{createdAt:'desc'},take:limit,include:{user:{select:{fullName:true,email:true}}}});
  ok(res,rows.map(row=>({id:row.id,action:row.action,entity:row.entity,entityId:row.entityId,createdAt:row.createdAt,user:row.user?{fullName:row.user.fullName,email:row.user.email}:null})));
}));

export default router;
