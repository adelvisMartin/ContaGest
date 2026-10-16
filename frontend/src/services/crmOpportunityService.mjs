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

/** UI-only guard. Backend still owns tenant, CAS and stage authorization. */
export function validateOpportunityLossAction(opportunity) {
  if(!opportunity || typeof opportunity.id !== 'string' || !UUID.test(opportunity.id) ||
     opportunity.stage !== 'qualified' || typeof opportunity.updatedAt !== 'string' ||
     !REVISION.test(opportunity.updatedAt) ||
     !Number.isFinite(Date.parse(opportunity.updatedAt)) ||
     new Date(opportunity.updatedAt).toISOString() !== opportunity.updatedAt)
    throw new TypeError('CRM_OPPORTUNITY_LOSS_INVALID');
  return Object.freeze({id:opportunity.id,expectedUpdatedAt:opportunity.updatedAt});
}

export function createCrmOpportunityService({api}) {
  if(!api || typeof api.get !== 'function' || typeof api.request !== 'function')
    throw new TypeError('CRM_OPPORTUNITY_API_REQUIRED');
  return Object.freeze({
    async forecast() {
      const result=await api.get(CRM_OPPORTUNITY_ENDPOINT+'/forecast');
      if(!result || result.policy!=='crm-qualified-forecast-v1' ||
        !Number.isSafeInteger(result.evaluatedCount) || result.evaluatedCount<0 ||
        !Number.isSafeInteger(result.excludedLostCount) || result.excludedLostCount<0 ||
        result.excludedLostCount>result.evaluatedCount ||
        !Array.isArray(result.currencyTotals)) throw new TypeError('CRM_FORECAST_RESPONSE_INVALID');
      const money=/^(?:0|[1-9]\d{0,15})\.\d{2}$/;
      let active=0,prior='';
      for(const row of result.currencyTotals){
        if(!row || typeof row.currency!=='string' ||
          !/^[A-Z]{3}$/.test(row.currency) || row.currency<=prior ||
          !Number.isSafeInteger(row.count) || row.count<1 ||
          typeof row.gross!=='string' || !money.test(row.gross) ||
          typeof row.weighted!=='string' || !money.test(row.weighted)) {
          throw new TypeError('CRM_FORECAST_RESPONSE_INVALID');
        }
        active+=row.count;
        prior=row.currency;
      }
      if(active+result.excludedLostCount!==result.evaluatedCount)
        throw new TypeError('CRM_FORECAST_RESPONSE_INVALID');
      return result;
    },
    async markLost(opportunity) {
      const {id,expectedUpdatedAt}=validateOpportunityLossAction(opportunity);
      const result=await api.request(CRM_OPPORTUNITY_ENDPOINT+'/'+id+'/lost',{
        method:'PATCH',body:{expectedUpdatedAt}
      });
      if(!result || result.id!==id || result.stage!=='lost' ||
         typeof result.updatedAt!=='string' || !REVISION.test(result.updatedAt))
        throw new TypeError('CRM_OPPORTUNITY_LOSS_RESULT_INVALID');
      return result;
    },
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
