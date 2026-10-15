import { forecastByCurrency } from './crm-domain.mjs';
import { CRM_OPPORTUNITY_MODULE } from './crm-opportunity-store.mjs';

export const CRM_FORECAST_PAGE_SIZE=250;
export const CRM_FORECAST_MAX_ROWS=10_000;

export class CrmForecastLimitError extends Error {
  constructor(){super('CRM_FORECAST_LIMIT_EXCEEDED');}
}
export class CrmForecastDataError extends Error {
  constructor(){super('CRM_FORECAST_DATA_INVALID');}
}

function projectForecastRow(row,tenantId,previousId) {
  if(!row || typeof row.id !== 'string' || !row.id ||
    (previousId && row.id <= previousId) ||
    row.tenantId !== tenantId || row.moduleSlug !== CRM_OPPORTUNITY_MODULE ||
    !['qualified','lost'].includes(row.status) ||
    !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload) ||
    typeof row.payload.currency !== 'string' ||
    typeof row.payload.expectedValue !== 'string' ||
    !Number.isInteger(row.payload.probability)) throw new CrmForecastDataError();
  return Object.freeze({
    tenantId,stage:row.status,currency:row.payload.currency,
    expectedValue:row.payload.expectedValue,probability:row.payload.probability
  });
}

/**
 * Snapshot tenant-safe forecast. Read all opportunity rows or fail closed:
 * returning only a first page would silently understate pipeline value.
 */
export async function summarizeCrmForecast({db,tenantId}) {
  if(typeof tenantId !== 'string' || !tenantId.trim()) throw new TypeError('CRM_TENANT_REQUIRED');
  if(!db || typeof db.$transaction !== 'function') throw new TypeError('CRM_TRANSACTION_REQUIRED');

  return db.$transaction(async tx=>{
    if(!tx.moduleRecord?.findMany) throw new TypeError('CRM_FORECAST_STORE_REQUIRED');
    const projected=[];
    let cursor;
    while(true) {
      const query={
        where:{tenantId,moduleSlug:CRM_OPPORTUNITY_MODULE,status:{not:'archived'}},
        select:{id:true,tenantId:true,moduleSlug:true,status:true,payload:true},
        orderBy:{id:'asc'},
        take:CRM_FORECAST_PAGE_SIZE,
        ...(cursor ? {cursor:{id:cursor},skip:1} : {})
      };
      const rows=await tx.moduleRecord.findMany(query);
      if(!Array.isArray(rows) || rows.length > CRM_FORECAST_PAGE_SIZE) throw new CrmForecastDataError();
      if(!rows.length) break;
      for(const row of rows) {
        if(projected.length >= CRM_FORECAST_MAX_ROWS) throw new CrmForecastLimitError();
        projected.push(projectForecastRow(row,tenantId,cursor));
        cursor=row.id;
      }
      if(rows.length < CRM_FORECAST_PAGE_SIZE) break;
    }
    // Existing domain implementation uses BigInt and rounds once per
    // currency after summing weighted minor-unit numerators.
    const currencyTotals=forecastByCurrency({tenantId,opportunities:projected});
    return Object.freeze({
      policy:'crm-qualified-forecast-v1',
      evaluatedCount:projected.length,
      excludedLostCount:projected.filter(row=>row.stage==='lost').length,
      currencyTotals
    });
  },{isolationLevel:'RepeatableRead',timeout:15_000});
}
