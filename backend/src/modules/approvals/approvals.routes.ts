import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { decimalSchema } from '../../shared/financial/zod.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import {
  APPROVAL_CAPABILITIES, approvalReport, breakGlassApproval, cancelApprovalRequest, createApprovalPolicy,
  createApprovalRequest, createDelegation, decideApprovalRequest, getActiveApprovalPolicy, listApprovalInbox, listApprovalPolicies,
  listMyApprovalRequests, reviseApprovalRequest, serializeApprovalAmount, approvalPolicyApplies
} from './approvals.service.js';
import { buildApprovalExecutionContext } from './approval-execution-gate.js';

const router=Router();router.use(requireTenant);
const capability=z.enum(APPROVAL_CAPABILITIES);
const context=(req:any)=>req.context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
const actor=(req:any)=>{const id=String(context(req).userId||'').trim();if(!id)throw new HttpError(401,'Se requiere un usuario autenticado.');return id;};
const policySchema=z.object({thresholdAmount:decimalSchema('money').nullable().optional(),currency:z.string().trim().min(3).max(4).nullable().optional(),requiredApprovals:z.number().int().min(1).max(5).default(1),selfApprovalAllowed:z.boolean().default(false),approverPermissions:z.array(z.string().trim().min(2).max(120)).default([]),approverRoles:z.array(z.string().trim().min(2).max(160)).default([]),expiresMinutes:z.number().int().min(5).max(43200).default(1440)}).strict();
const requestSchema=z.object({capability,payload:z.record(z.string(),z.unknown()),amount:decimalSchema('money').nullable().optional(),currency:z.string().trim().min(3).max(4).nullable().optional(),reasonCode:z.string().trim().min(2).max(64).optional(),comment:z.string().trim().max(1000).optional()}).strict();
const reviseSchema=z.object({payload:z.record(z.string(),z.unknown()),amount:decimalSchema('money').nullable().optional(),currency:z.string().trim().min(3).max(4).nullable().optional(),comment:z.string().trim().max(1000).optional()}).strict();
const decisionSchema=z.object({reasonCode:z.string().trim().min(2).max(64).optional(),comment:z.string().trim().max(1000).optional()}).strict();
const breakGlassSchema=z.object({reasonCode:z.string().trim().min(3).max(64),comment:z.string().trim().min(10).max(1000)}).strict();
const delegationSchema=z.object({delegateId:z.string().uuid(),capability:z.union([capability,z.literal('*')]).default('*'),startsAt:z.coerce.date(),endsAt:z.coerce.date(),reason:z.string().trim().min(5).max(500)}).strict();
const contextSchema=z.object({method:z.enum(['POST','PATCH']),path:z.string().trim().startsWith('/').max(300),body:z.record(z.string(),z.unknown()).default({})}).strict();
const serialize=(row:any)=>({...row,thresholdAmount:row.thresholdAmount===undefined?undefined:serializeApprovalAmount(row.thresholdAmount),amount:row.amount===undefined?undefined:serializeApprovalAmount(row.amount)});

router.get('/capabilities',asyncHandler(async(_req,res)=>ok(res,{capabilities:APPROVAL_CAPABILITIES})));
router.post('/execution-context',validateBody(contextSchema),asyncHandler(async(req,res)=>{
  const tenantId=context(req).tenantId;const execution=await buildApprovalExecutionContext({tenantId,...req.body});
  if(!execution)throw new HttpError(422,'La operación no está registrada como capability maker-checker.',{code:'APPROVAL_EXECUTION_NOT_MAPPED'});
  const policy=await getActiveApprovalPolicy(tenantId,execution.capability);ok(res,{...execution,required:approvalPolicyApplies(policy,execution.amount,execution.currency),policy:policy?serialize(policy):null,header:'x-approval-request-id'});
}));
router.get('/policies',requirePermission('admin.manage'),asyncHandler(async(req,res)=>ok(res,(await listApprovalPolicies(context(req).tenantId)).map(serialize))));
router.post('/policies/:capability/versions',requirePermission('admin.manage'),validateBody(policySchema),asyncHandler(async(req,res)=>{
  const ctx=context(req);const capabilityValue=capability.parse(req.params.capability);const created=await createApprovalPolicy({tenantId:ctx.tenantId,capability:capabilityValue,...req.body,createdBy:actor(req)});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'approval.policy.version-created',entity:'ApprovalPolicy',entityId:created.id,after:{...serialize(created),approverPermissions:created.approverPermissions,approverRoles:created.approverRoles},ipAddress:ctx.ip,userAgent:ctx.userAgent});
  res.status(201).json({ok:true,data:serialize(created)});
}));
router.post('/requests',validateBody(requestSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req);const created=await createApprovalRequest({tenantId:ctx.tenantId,requesterId:actor(req),...req.body});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'approval.requested',entity:'ApprovalRequest',entityId:created.id,after:{capability:created.capability,payloadHash:created.payloadHash,policyVersion:created.policyVersion,amount:serializeApprovalAmount(created.amount),currency:created.currency},ipAddress:ctx.ip,userAgent:ctx.userAgent});
  res.status(201).json({ok:true,data:serialize(created)});
}));
router.patch('/requests/:id',validateBody(reviseSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req);const updated=await reviseApprovalRequest({tenantId:ctx.tenantId,requesterId:actor(req),requestId:req.params.id,...req.body});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'approval.request.revised',entity:'ApprovalRequest',entityId:updated.id,after:{revision:updated.revision,payloadHash:updated.payloadHash,status:updated.status},ipAddress:ctx.ip,userAgent:ctx.userAgent});ok(res,serialize(updated));
}));
router.get('/mine',asyncHandler(async(req,res)=>ok(res,(await listMyApprovalRequests(context(req).tenantId,actor(req))).map(serialize))));
router.get('/inbox',asyncHandler(async(req,res)=>ok(res,(await listApprovalInbox(context(req).tenantId,actor(req))).map(serialize))));
router.post('/requests/:id/approve',validateBody(decisionSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req);const updated=await decideApprovalRequest({tenantId:ctx.tenantId,approverId:actor(req),requestId:req.params.id,decision:'approved',...req.body});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'approval.approved',entity:'ApprovalRequest',entityId:updated.id,after:{revision:updated.revision,payloadHash:updated.payloadHash,approvedCount:updated.approvedCount,status:updated.status,reasonCode:req.body.reasonCode||null},ipAddress:ctx.ip,userAgent:ctx.userAgent});ok(res,serialize(updated));
}));
router.post('/requests/:id/reject',validateBody(decisionSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req);const updated=await decideApprovalRequest({tenantId:ctx.tenantId,approverId:actor(req),requestId:req.params.id,decision:'rejected',...req.body});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'approval.rejected',entity:'ApprovalRequest',entityId:updated.id,after:{revision:updated.revision,payloadHash:updated.payloadHash,status:updated.status,reasonCode:req.body.reasonCode||null},ipAddress:ctx.ip,userAgent:ctx.userAgent});ok(res,serialize(updated));
}));
router.post('/requests/:id/cancel',asyncHandler(async(req,res)=>{const ctx=context(req);const updated=await cancelApprovalRequest({tenantId:ctx.tenantId,actorId:actor(req),requestId:req.params.id});await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'approval.cancelled',entity:'ApprovalRequest',entityId:updated.id,after:{status:updated.status},ipAddress:ctx.ip,userAgent:ctx.userAgent});ok(res,serialize(updated));}));
router.post('/requests/:id/break-glass',requirePermission('admin.manage'),validateBody(breakGlassSchema),asyncHandler(async(req,res)=>ok(res,serialize(await breakGlassApproval({tenantId:context(req).tenantId,actorId:actor(req),requestId:req.params.id,...req.body})))));
router.post('/delegations',validateBody(delegationSchema),asyncHandler(async(req,res)=>{
  const ctx=context(req);const delegatorId=actor(req);const created=await createDelegation({tenantId:ctx.tenantId,delegatorId,...req.body});await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'approval.delegation.created',entity:'ApprovalDelegation',entityId:created.id,after:{delegateId:created.delegateId,capability:created.capability,startsAt:created.startsAt,endsAt:created.endsAt,reason:created.reason},ipAddress:ctx.ip,userAgent:ctx.userAgent});res.status(201).json({ok:true,data:created});
}));
router.get('/report',requirePermission('audit.read'),asyncHandler(async(req,res)=>ok(res,{generatedAt:new Date().toISOString(),rows:await approvalReport(context(req).tenantId)})));

export default router;
