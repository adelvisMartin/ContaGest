import { CRM_OPPORTUNITY_MODULE } from './crm-opportunity-store.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export class CrmOpportunityNotFoundError extends Error {
  constructor(){ super('CRM_OPPORTUNITY_NOT_FOUND'); }
}
export class CrmOpportunityStaleError extends Error {
  constructor(){ super('CRM_OPPORTUNITY_STALE_REVISION'); }
}
export class CrmOpportunityStageError extends Error {
  constructor(){ super('CRM_OPPORTUNITY_STAGE_BLOCKED'); }
}

/**
 * Lost is the only immediately supported opportunity stage change: a proposal
 * requires a real Quote authority and 'won' requires commercial verification.
 */
export function planOpportunityLoss({stage,expectedUpdatedAt}) {
  if(stage !== 'qualified') throw new CrmOpportunityStageError();
  if(typeof expectedUpdatedAt !== 'string' || !UTC.test(expectedUpdatedAt) ||
    !Number.isFinite(Date.parse(expectedUpdatedAt)) ||
    new Date(expectedUpdatedAt).toISOString() !== expectedUpdatedAt)
    throw new TypeError('CRM_OPPORTUNITY_REVISION_REQUIRED');
  return Object.freeze({from:'qualified',to:'lost',expectedUpdatedAt});
}

export async function markCrmOpportunityLost({
  db,tenantId,actorId,opportunityId,expectedUpdatedAt,ipAddress,userAgent
}) {
  if(typeof tenantId !== 'string' || !tenantId.trim()) throw new TypeError('CRM_TENANT_REQUIRED');
  if(typeof actorId !== 'string' || !actorId.trim()) throw new TypeError('CRM_ACTOR_REQUIRED');
  if(typeof opportunityId !== 'string' || !UUID.test(opportunityId))
    throw new TypeError('CRM_OPPORTUNITY_ID_INVALID');
  // Reject bad client-controlled revisions before using database connections.
  planOpportunityLoss({stage:'qualified',expectedUpdatedAt});
  if(!db || typeof db.$transaction !== 'function') throw new TypeError('CRM_TRANSACTION_REQUIRED');
  return db.$transaction(async tx=>{
    if(!tx.moduleRecord?.findFirst || !tx.moduleRecord?.updateMany || !tx.auditLog?.create)
      throw new TypeError('CRM_OPPORTUNITY_AUDIT_AUTHORITY_REQUIRED');
    const where={id:opportunityId,tenantId,moduleSlug:CRM_OPPORTUNITY_MODULE};
    const previous=await tx.moduleRecord.findFirst({
      where,select:{id:true,tenantId:true,moduleSlug:true,status:true,updatedAt:true}
    });
    if(!previous || previous.id !== opportunityId || previous.tenantId !== tenantId ||
       previous.moduleSlug !== CRM_OPPORTUNITY_MODULE)
      throw new CrmOpportunityNotFoundError();
    if(previous.status !== 'qualified') throw new CrmOpportunityStageError();
    if(!(previous.updatedAt instanceof Date) ||
       previous.updatedAt.toISOString() !== expectedUpdatedAt)
      throw new CrmOpportunityStaleError();
    const changed=await tx.moduleRecord.updateMany({
      where:{...where,status:'qualified',updatedAt:new Date(expectedUpdatedAt)},
      data:{status:'lost'}
    });
    if(changed?.count !== 1) throw new CrmOpportunityStaleError();
    await tx.auditLog.create({
      data:{
        tenantId,userId:actorId,action:'crm.opportunity.stage.lost',
        entity:'ModuleRecord',entityId:opportunityId,
        before:{moduleSlug:CRM_OPPORTUNITY_MODULE,stage:'qualified'},
        after:{moduleSlug:CRM_OPPORTUNITY_MODULE,stage:'lost'},
        ipAddress:ipAddress || null,userAgent:userAgent || null
      }
    });
    const updated=await tx.moduleRecord.findFirst({
      where,select:{id:true,tenantId:true,moduleSlug:true,status:true,updatedAt:true}
    });
    if(!updated || updated.id !== opportunityId || updated.tenantId !== tenantId ||
       updated.moduleSlug !== CRM_OPPORTUNITY_MODULE || updated.status !== 'lost' ||
       !(updated.updatedAt instanceof Date)) throw new Error('CRM_OPPORTUNITY_POST_WRITE_INVALID');
    return Object.freeze({id:opportunityId,stage:'lost',updatedAt:updated.updatedAt.toISOString()});
  });
}
