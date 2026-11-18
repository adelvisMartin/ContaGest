import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { createBenefit,grantCustomerRight,readCustomerRightsPage } from './customer-entitlement.service.js';
import { customerRightsPage } from './customer-rights-pagination.mjs';

const router=Router();
router.use(requireTenant);
router.use(requirePermission('admin.manage'));
const ctx=(req:any)=>req.context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
const uuid=z.string().uuid();
const amount=z.string().regex(/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,3})?$/)
  .refine(value=>Number(value)>0);
const create=z.object({
  productId:uuid,
  name:z.string().trim().min(1).max(160),
  scope:z.enum(['ALL','SERVICE','CATEGORY']),
  serviceId:uuid.nullish(),categoryId:uuid.nullish(),
  quantity:amount
}).strict().superRefine((row,context)=>{
  const valid=row.scope==='ALL'? !row.serviceId&&!row.categoryId :
    row.scope==='SERVICE'?Boolean(row.serviceId)&&!row.categoryId:
      Boolean(row.categoryId)&&!row.serviceId;
  if(!valid)context.addIssue({code:'custom',message:'Alcance de beneficio inválido.'});
});
const rightsPagination=z.object({
  take:z.coerce.number().int().min(1).max(100).default(100),
  skip:z.coerce.number().int().min(0).max(100000).default(0)
}).strict();
const grant=z.object({
  benefitId:uuid,beneficiaryId:uuid,effectKey:z.string().regex(/^[A-Za-z0-9:_-]{8,128}$/),
  reason:z.string().trim().min(10).max(500),
  validFrom:z.string().datetime({offset:true}),validUntil:z.string().datetime({offset:true}),
  locationId:uuid.nullish()
}).strict();
router.get('/benefits',asyncHandler(async(req,res)=>{
  const pagination=rightsPagination.parse(req.query);
  // The benefit catalogue is tenant-scoped. A sentinel record detects an
  // additional page without changing the array response contract.
  const rows=await prisma.benefitDefinition.findMany({
    where:{tenantId:ctx(req).tenantId},
    orderBy:[{createdAt:'desc'},{id:'asc'}],
    skip:pagination.skip,take:pagination.take+1
  });
  const page=customerRightsPage(rows,pagination);
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Pagination-Has-More',page.hasMore?'true':'false');
  if(page.nextSkip!==null)res.setHeader('X-Pagination-Next-Skip',String(page.nextSkip));
  ok(res,page.items);
}));
router.post('/benefits',validateBody(create),asyncHandler(async(req,res)=>{
  ok(res,await createBenefit(ctx(req),req.body),201);
}));
router.post('/manual-grants',validateBody(grant),asyncHandler(async(req,res)=>{
  const b=req.body;
  const response=await grantCustomerRight(ctx(req),{
    benefitId:b.benefitId,beneficiaryId:b.beneficiaryId,effectKey:b.effectKey,
    reason:b.reason,validFrom:new Date(b.validFrom),validUntil:new Date(b.validUntil),
    locationId:b.locationId
  });
  res.setHeader('Idempotency-Replayed',response.replayed?'true':'false');
  ok(res,response.entitlement,response.replayed?200:201);
}));
router.get('/clients/:id',asyncHandler(async(req,res)=>{
  const id=uuid.safeParse(req.params.id);
  if(!id.success)throw new HttpError(422,'Identificador de beneficiario inválido.');
  const pagination=rightsPagination.parse(req.query);
  const page=await readCustomerRightsPage(ctx(req),id.data,pagination);
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Pagination-Has-More',page.hasMore?'true':'false');
  if(page.nextSkip!==null)res.setHeader('X-Pagination-Next-Skip',String(page.nextSkip));
  // Existing response contract stays an array; page metadata is in headers.
  ok(res,page.items);
}));
// No consume/refund endpoint. #852 writes must be atomic with #848 booking +
// #637 finance and must revalidate ledger sequence inside one SQL transaction.
export default router;
