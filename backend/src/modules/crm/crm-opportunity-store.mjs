import { createHash } from 'node:crypto';
import { amountToMinorUnits, minorUnitsToAmount } from './crm-domain.mjs';
import { CRM_LEAD_MODULE } from './crm-lead-store.mjs';

export const CRM_OPPORTUNITY_MODULE = 'crm-opportunities';
export const CRM_OPPORTUNITY_MAX_PAGE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export class CrmOpportunityConflictError extends Error { constructor(){super('CRM_OPPORTUNITY_CONFLICT')} }
export class CrmOpportunityLeadNotFoundError extends Error { constructor(){super('CRM_QUALIFIED_LEAD_NOT_FOUND')} }

function validRevision(value) {
  return typeof value === 'string' && ISO_UTC.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

/** Stable tenant+Lead PK: exactly one first opportunity per qualified Lead. */
export function opportunityIdForLead(tenantId,leadId) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) throw new TypeError('CRM_TENANT_REQUIRED');
  if (typeof leadId !== 'string' || !UUID.test(leadId)) throw new TypeError('CRM_LEAD_ID_INVALID');
  const bytes=createHash('sha256').update('contagest:crm-opportunity:v1\0')
    .update(tenantId).update('\0').update(leadId.toLowerCase()).digest().subarray(0,16);
  bytes[6]=(bytes[6]&0x0f)|0x50;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const h=bytes.toString('hex');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}

export function validateOpportunityDraft(value) {
  if(!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('CRM_OPPORTUNITY_INPUT_INVALID');
  if (!validRevision(value.expectedLeadUpdatedAt)) throw new TypeError('CRM_LEAD_REVISION_REQUIRED');
  if(typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)) throw new TypeError('CRM_CURRENCY_INVALID');
  if(!Number.isInteger(value.probability) || value.probability < 0 || value.probability > 100)
    throw new TypeError('CRM_PROBABILITY_INVALID');
  const minor = amountToMinorUnits(value.expectedValue);
  if(minor <= 0n) throw new TypeError('CRM_VALUE_MUST_BE_POSITIVE');
  const title=typeof value.title === 'string' ? value.title.trim() : '';
  if(title.length < 2 || title.length > 180) throw new TypeError('CRM_OPPORTUNITY_TITLE_INVALID');
  return Object.freeze({
    title, currency:value.currency, expectedValue:minorUnitsToAmount(minor),
    probability:value.probability, expectedLeadUpdatedAt:value.expectedLeadUpdatedAt
  });
}

export function serializeCrmOpportunity(record) {
  if(!record || record.moduleSlug !== CRM_OPPORTUNITY_MODULE) throw new TypeError('CRM_OPPORTUNITY_RECORD_INVALID');
  const payload=record.payload;
  if(!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      typeof payload.leadId !== 'string') throw new TypeError('CRM_OPPORTUNITY_PAYLOAD_INVALID');
  return Object.freeze({
    id:record.id, leadId:payload.leadId, title:record.title, stage:record.status,
    currency:payload.currency, expectedValue:payload.expectedValue,
    probability:payload.probability, ownerId:payload.ownerId,
    createdAt:record.createdAt, updatedAt:record.updatedAt
  });
}

/**
 * In a single DB transaction, CAS-lock the qualified Lead before materializing
 * the uniquely derived Opportunity and minimal AuditLog.
 *
 * CAS updates the Lead's updatedAt even when the stage remains 'qualified'.
 * This invalidates stale stage actions and serializes with qualified→lost.
 */
export async function createOpportunityFromQualifiedLead({
  db, tenantId, actorId, leadId, draft, ipAddress, userAgent
}) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) throw new TypeError('CRM_TENANT_REQUIRED');
  if (typeof actorId !== 'string' || !actorId.trim()) throw new TypeError('CRM_ACTOR_REQUIRED');
  if (!db || typeof db.$transaction !== 'function') throw new TypeError('CRM_TRANSACTION_REQUIRED');
  const id=opportunityIdForLead(tenantId,leadId);
  const input=validateOpportunityDraft(draft);
  try {
    const result=await db.$transaction(async tx=>{
      if(!tx.moduleRecord?.findFirst || !tx.moduleRecord?.updateMany ||
         !tx.moduleRecord?.create || !tx.auditLog?.create) throw new TypeError('CRM_OPPORTUNITY_AUDIT_AUTHORITY_REQUIRED');
      const leadWhere={id:leadId,tenantId,moduleSlug:CRM_LEAD_MODULE};
      const lead=await tx.moduleRecord.findFirst({
        where:leadWhere,select:{id:true,tenantId:true,moduleSlug:true,status:true,updatedAt:true}
      });
      if(!lead) throw new CrmOpportunityLeadNotFoundError();
      if(lead.status !== 'qualified' || !(lead.updatedAt instanceof Date) ||
        lead.updatedAt.toISOString() !== input.expectedLeadUpdatedAt) throw new CrmOpportunityConflictError();
      const lock=await tx.moduleRecord.updateMany({
        where:{...leadWhere,status:'qualified',updatedAt:new Date(input.expectedLeadUpdatedAt)},
        data:{status:'qualified'}
      });
      if(lock?.count !== 1) throw new CrmOpportunityConflictError();
      const record=await tx.moduleRecord.create({
        data:{
          id,tenantId,moduleSlug:CRM_OPPORTUNITY_MODULE,title:input.title,status:'qualified',
          payload:{
            schemaVersion:1,leadId,ownerId:actorId,currency:input.currency,
            expectedValue:input.expectedValue,probability:input.probability
          }
        }
      });
      await tx.auditLog.create({
        data:{
          tenantId,userId:actorId,action:'crm.opportunity.create',entity:'ModuleRecord',
          entityId:id,after:{moduleSlug:CRM_OPPORTUNITY_MODULE,leadId,stage:'qualified',ownerId:actorId},
          ipAddress:ipAddress || null,userAgent:userAgent || null
        }
      });
      return record;
    });
    return serializeCrmOpportunity(result);
  } catch (error) {
    if(error?.code === 'P2002') throw new CrmOpportunityConflictError();
    throw error;
  }
}

export async function listCrmOpportunities({db,tenantId,take=50,skip=0}) {
  if(typeof tenantId !== 'string' || !tenantId.trim()) throw new TypeError('CRM_TENANT_REQUIRED');
  if(!db?.moduleRecord?.findMany) throw new TypeError('CRM_STORE_REQUIRED');
  if(!Number.isInteger(take) || take < 1 || take > CRM_OPPORTUNITY_MAX_PAGE) throw new TypeError('CRM_PAGE_LIMIT');
  if(!Number.isInteger(skip) || skip < 0 || skip > 10000) throw new TypeError('CRM_PAGE_OFFSET');
  const rows=await db.moduleRecord.findMany({
    where:{tenantId,moduleSlug:CRM_OPPORTUNITY_MODULE,status:{not:'archived'}},
    take,skip,orderBy:[{createdAt:'desc'},{id:'desc'}]
  });
  if(!Array.isArray(rows) || rows.some(row => row?.tenantId !== tenantId || row?.moduleSlug !== CRM_OPPORTUNITY_MODULE))
    throw new Error('CRM_OPPORTUNITY_TENANT_LEAK_BLOCKED');
  return Object.freeze(rows.map(serializeCrmOpportunity));
}
