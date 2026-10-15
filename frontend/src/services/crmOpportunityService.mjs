/**
 * #760 Opportunity drafts: browser is never authority for tenant, Client,
 * fiscal documents, FX exchange rates, or the qualified Lead's revision.
 */
export const CRM_OPPORTUNITY_ENDPOINT='/modules/crm/opportunities';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MONEY=/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

export function validateOpportunityForm(lead,values) {
  if(!lead || typeof lead.id !== 'string' || !UUID.test(lead.id) ||
     lead.stage !== 'qualified' ||
     typeof lead.updatedAt !== 'string' || !REVISION.test(lead.updatedAt) ||
     !Number.isFinite(Date.parse(lead.updatedAt)) ||
     new Date(lead.updatedAt).toISOString() !== lead.updatedAt)
    throw new TypeError('CRM_QUALIFIED_LEAD_REQUIRED');
  if(!values || typeof values !== 'object' || Array.isArray(values))
    throw new TypeError('CRM_OPPORTUNITY_FORM_INVALID');
  const title=typeof values.title === 'string' ? values.title.trim() : '';
  const currency=typeof values.currency === 'string' ? values.currency.trim() : '';
  const value=typeof values.expectedValue === 'string' ? values.expectedValue.trim() : '';
  const probabilityRaw=typeof values.probability === 'string' ? values.probability.trim() :
    Number.isInteger(values.probability) ? String(values.probability) : '';
  if(title.length < 2 || title.length > 180 ||
     !/^[A-Z]{3}$/.test(currency) || !MONEY.test(value) ||
     !/^(?:0|[1-9]\d{0,2})$/.test(probabilityRaw))
    throw new TypeError('CRM_OPPORTUNITY_FORM_INVALID');
  const [whole,fraction='']=value.split('.');
  if(BigInt(whole)*100n + BigInt((fraction+'00').slice(0,2)) === 0n)
    throw new TypeError('CRM_OPPORTUNITY_VALUE_ZERO');
  const probability=Number(probabilityRaw);
  if(probability > 100) throw new TypeError('CRM_OPPORTUNITY_PROBABILITY_INVALID');
  return Object.freeze({
    leadId:lead.id,
    payload:Object.freeze({title,currency,expectedValue:value,
      probability,expectedLeadUpdatedAt:lead.updatedAt})
  });
}

export function createCrmOpportunityService({api}) {
  if(!api || typeof api.get !== 'function' || typeof api.request !== 'function')
    throw new TypeError('CRM_OPPORTUNITY_API_REQUIRED');
  return Object.freeze({
    async list() {
      const data=await api.get(CRM_OPPORTUNITY_ENDPOINT+'?take=50&skip=0');
      if(!Array.isArray(data)) throw new TypeError('CRM_OPPORTUNITY_LIST_INVALID');
      return data;
    },
    async createFromLead(lead,values) {
      const {leadId,payload}=validateOpportunityForm(lead,values);
      const result=await api.request(CRM_OPPORTUNITY_ENDPOINT+'/from-lead/'+leadId,{
        method:'POST',body:payload
      });
      if(!result || typeof result !== 'object' ||
         typeof result.id !== 'string' || result.leadId !== leadId ||
         result.stage !== 'qualified')
        throw new TypeError('CRM_OPPORTUNITY_RESULT_INVALID');
      return result;
    }
  });
}
