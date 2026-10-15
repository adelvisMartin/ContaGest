import { transitionOpportunity } from './crm-domain.mjs';
import { CRM_LEAD_MODULE } from './crm-lead-store.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LEAD_STAGES = new Set(['new','qualified','lost']);

export class CrmLeadNotFoundError extends Error { constructor(){super('CRM_LEAD_NOT_FOUND')} }
export class CrmLeadConflictError extends Error { constructor(){super('CRM_LEAD_STALE_REVISION')} }
export class CrmLeadStageError extends Error { constructor(){super('INVALID_CRM_LEAD_STAGE')} }

/**
 * Stage changes are deliberately limited to lead qualification and rejection.
 * Proposal/won belong to the future opportunity/quote authority, not Lead.
 */
export function planLeadStageTransition({from,to,expectedUpdatedAt}) {
  if (!LEAD_STAGES.has(from) || !LEAD_STAGES.has(to)) throw new CrmLeadStageError();
  if (!ISO_UTC.test(expectedUpdatedAt || '') ||
      !Number.isFinite(Date.parse(expectedUpdatedAt)) ||
      new Date(expectedUpdatedAt).toISOString() !== expectedUpdatedAt) {
    throw new TypeError('CRM_LEAD_REVISION_REQUIRED');
  }
  try { transitionOpportunity(from,to); } catch { throw new CrmLeadStageError(); }
  return Object.freeze({from,to,expectedUpdatedAt});
}

/**
 * One interactive database transaction owns fetch → CAS update → minimal audit.
 * Optimistic CAS includes the canonical tenant, slug, prior stage AND timestamp.
 * It never writes a Client, emits a quote or updates an Opportunity.
 */
export async function transitionCrmLeadStage({
  db, tenantId, actorId, leadId, nextStage, expectedUpdatedAt, ipAddress, userAgent
}) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) throw new TypeError('CRM_TENANT_REQUIRED');
  if (typeof actorId !== 'string' || !actorId.trim()) throw new TypeError('CRM_ACTOR_REQUIRED');
  if (typeof leadId !== 'string' || !UUID.test(leadId)) throw new TypeError('CRM_LEAD_ID_INVALID');
  if (!db || typeof db.$transaction !== 'function') throw new TypeError('CRM_TRANSACTION_REQUIRED');
  // Invalid revisions and stages must fail before touching a database connection.
  if (!LEAD_STAGES.has(nextStage)) throw new CrmLeadStageError();
  if (!ISO_UTC.test(expectedUpdatedAt || '') ||
      !Number.isFinite(Date.parse(expectedUpdatedAt)) ||
      new Date(expectedUpdatedAt).toISOString() !== expectedUpdatedAt) {
    throw new TypeError('CRM_LEAD_REVISION_REQUIRED');
  }
  return db.$transaction(async tx => {
    if (!tx.moduleRecord?.findFirst || !tx.moduleRecord?.updateMany || !tx.auditLog?.create) {
      throw new TypeError('CRM_STAGE_AUDIT_AUTHORITY_REQUIRED');
    }
    const where = {id:leadId,tenantId,moduleSlug:CRM_LEAD_MODULE};
    const before = await tx.moduleRecord.findFirst({
      where,select:{id:true,tenantId:true,moduleSlug:true,status:true,updatedAt:true}
    });
    if (!before) throw new CrmLeadNotFoundError();
    const actualRevision = before.updatedAt instanceof Date ? before.updatedAt.toISOString() : null;
    if (actualRevision !== expectedUpdatedAt) throw new CrmLeadConflictError();
    const intent = planLeadStageTransition({from:before.status,to:nextStage,expectedUpdatedAt});
    const changed = await tx.moduleRecord.updateMany({
      where:{...where,status:intent.from,updatedAt:new Date(expectedUpdatedAt)},
      data:{status:intent.to}
    });
    if (changed?.count !== 1) throw new CrmLeadConflictError();
    await tx.auditLog.create({
      data:{
        tenantId,userId:actorId,action:'crm.lead.stage.change',
        entity:'ModuleRecord',entityId:leadId,
        before:{moduleSlug:CRM_LEAD_MODULE,stage:intent.from},
        after:{moduleSlug:CRM_LEAD_MODULE,stage:intent.to},
        ipAddress:ipAddress || null,userAgent:userAgent || null
      }
    });
    const after = await tx.moduleRecord.findFirst({
      where,select:{id:true,tenantId:true,moduleSlug:true,status:true,updatedAt:true}
    });
    if (!after || after.tenantId !== tenantId || after.moduleSlug !== CRM_LEAD_MODULE ||
        after.status !== nextStage || !(after.updatedAt instanceof Date)) throw new Error('CRM_STAGE_POST_WRITE_INVALID');
    return Object.freeze({id:after.id,stage:after.status,updatedAt:after.updatedAt.toISOString()});
  });
}
