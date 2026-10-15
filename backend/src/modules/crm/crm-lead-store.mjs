import { normalizeLeadIdentity } from './crm-domain.mjs';

export const CRM_LEAD_MODULE = 'crm-leads';
export const CRM_LEAD_MAX_PAGE = 100;

function boundedText(value, label, min, max) {
  if (typeof value !== 'string') throw new TypeError('INVALID_CRM_LEAD_' + label);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new TypeError('INVALID_CRM_LEAD_' + label);
  return normalized;
}

export function validateCrmLeadDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('INVALID_CRM_LEAD_DRAFT');
  const name = boundedText(input.name, 'NAME', 2, 180);
  const rawRif = input.rif == null ? '' : boundedText(input.rif, 'RIF', 1, 40);
  const rawEmail = input.email == null ? '' : boundedText(input.email, 'EMAIL', 1, 254);
  if (!rawRif && !rawEmail) throw new TypeError('CRM_LEAD_CONTACT_REQUIRED');
  const identity = normalizeLeadIdentity({ rif:rawRif, email:rawEmail });
  if ((rawRif && !identity.rif) || (rawEmail && !identity.email)) throw new TypeError('INVALID_CRM_LEAD_IDENTITY');
  const phone = input.phone == null ? null : boundedText(input.phone, 'PHONE', 1, 60);
  const notes = input.notes == null ? null : boundedText(input.notes, 'NOTES', 1, 2000);
  const nextActionAt = input.nextActionAt == null ? null : boundedText(input.nextActionAt, 'NEXT_ACTION', 24, 24);
  if (nextActionAt && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(nextActionAt) ||
      !Number.isFinite(Date.parse(nextActionAt)) || new Date(nextActionAt).toISOString() !== nextActionAt)) {
    throw new TypeError('INVALID_CRM_LEAD_NEXT_ACTION');
  }
  return Object.freeze({ name, rif:identity.rif, email:identity.email, phone, notes, nextActionAt });
}

export function serializeCrmLead(record) {
  if (!record || record.moduleSlug !== CRM_LEAD_MODULE) throw new TypeError('NOT_CRM_LEAD_RECORD');
  const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
    ? record.payload : {};
  return Object.freeze({
    id:record.id, name:record.title, stage:record.status,
    rif:payload.rif ?? null, email:payload.email ?? null,
    phone:payload.phone ?? null, notes:payload.notes ?? null,
    ownerId:payload.ownerId ?? null, nextActionAt:payload.nextActionAt ?? null,
    createdAt:record.createdAt, updatedAt:record.updatedAt
  });
}

/**
 * Real transaction: lead insert and audit insert commit or roll back together.
 * No Client table or customer-master mutation occurs.
 */
export async function createCrmLead({db,tenantId,actorId,draft,ipAddress,userAgent}) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) throw new TypeError('CRM_TENANT_REQUIRED');
  if (typeof actorId !== 'string' || !actorId.trim()) throw new TypeError('CRM_ACTOR_REQUIRED');
  if (!db || typeof db.$transaction !== 'function') throw new TypeError('CRM_TRANSACTION_REQUIRED');
  const input = validateCrmLeadDraft(draft);
  const record = await db.$transaction(async tx => {
    if (!tx.moduleRecord?.create || !tx.auditLog?.create) throw new TypeError('CRM_AUDIT_AUTHORITY_REQUIRED');
    const saved = await tx.moduleRecord.create({
      data:{
        tenantId, moduleSlug:CRM_LEAD_MODULE,
        title:input.name, status:'new',
        payload:{
          schemaVersion:1, rif:input.rif, email:input.email,
          phone:input.phone, notes:input.notes, ownerId:actorId, nextActionAt:input.nextActionAt
        }
      }
    });
    await tx.auditLog.create({
      data:{
        tenantId, userId:actorId, action:'crm.lead.create',
        entity:'ModuleRecord', entityId:saved.id,
        after:{moduleSlug:CRM_LEAD_MODULE,stage:'new',ownerId:actorId},
        ipAddress:ipAddress || null, userAgent:userAgent || null
      }
    });
    return saved;
  });
  return serializeCrmLead(record);
}

export async function listCrmLeads({db,tenantId,take=50,skip=0}) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) throw new TypeError('CRM_TENANT_REQUIRED');
  if (!db?.moduleRecord?.findMany) throw new TypeError('CRM_STORE_REQUIRED');
  if (!Number.isInteger(take) || take < 1 || take > CRM_LEAD_MAX_PAGE) throw new TypeError('CRM_PAGE_LIMIT');
  if (!Number.isInteger(skip) || skip < 0 || skip > 10000) throw new TypeError('CRM_PAGE_OFFSET');
  const records = await db.moduleRecord.findMany({
    where:{tenantId,moduleSlug:CRM_LEAD_MODULE,status:{not:'archived'}},
    take,skip,orderBy:[{createdAt:'desc'},{id:'desc'}]
  });
  if (!Array.isArray(records)) throw new TypeError('CRM_STORE_RESPONSE_INVALID');
  if (records.some(row => row.tenantId !== tenantId || row.moduleSlug !== CRM_LEAD_MODULE)) {
    throw new Error('CRM_TENANT_DATA_LEAK_BLOCKED');
  }
  return Object.freeze(records.map(serializeCrmLead));
}
