import { MODULE_VISUAL_CATALOG } from './module-visual-catalog.mjs';

export const ERP_E2E_STATES_V155=Object.freeze([
  'baseline','loading','empty','error','offline','stale','role-denied','boundary'
]);
export const ERP_E2E_ROLES_V155=Object.freeze(['admin','operator','read-only']);
export const ERP_E2E_VIEWPORTS_V155=Object.freeze([
  {name:'phone-360',width:360,height:800,orientation:'portrait'},
  {name:'phone-390',width:390,height:844,orientation:'portrait'},
  {name:'phone-430',width:430,height:932,orientation:'portrait'},
  {name:'tablet-768',width:768,height:1024,orientation:'portrait'},
  {name:'desktop-1366',width:1366,height:768,orientation:'landscape'},
  {name:'desktop-1920',width:1920,height:1080,orientation:'landscape'},
  {name:'phone-360-landscape',width:800,height:360,orientation:'landscape'},
  {name:'phone-390-landscape',width:844,height:390,orientation:'landscape'},
  {name:'phone-430-landscape',width:932,height:430,orientation:'landscape'}
]);

export const ERP_E2E_CRITICAL_FLOWS_V155=Object.freeze({
  dashboard:['load-representative-kpis','cross-module-navigation'],
  ventas:['create-read-refresh-sale','retry-idempotent-sale','cancel-or-reversal'],
  inventario:['create-inventory-movement','refresh-reconcile-stock','negative-stock-boundary'],
  tributos:['calculate-tax','permission-and-period-boundary'],
  contabilidad:['post-journal-entry','refresh-ledger-reconcile','reversal'],
  'libro-mayor':['query-ledger','cross-check-journal-posting'],
  'balance-sumas-saldos':['generate-balance','debit-credit-reconcile'],
  'hoja-trabajo':['generate-workpaper','period-boundary'],
  'estados-financieros':['generate-statements','cross-check-ledger'],
  'cierre-contable':['pre-close-checks','close-period','reject-post-close-write'],
  bancos:['create-bank-movement','reconcile-movement','reverse-correction'],
  nomina:['calculate-payroll','persist-payroll','correction-or-reversal'],
  compras:['create-read-refresh-purchase','retry-idempotent-purchase','cancel-or-reversal'],
  auditoria:['filter-audit-log','cross-tenant-denial'],
  'libro-ventas':['generate-sales-book','period-boundary'],
  admin:['manage-role-permission','cross-tenant-denial'],
  login:['login-valid','login-invalid-throttle','logout-relogin'],
  'plan-cuentas':['create-account','deprecate-used-account','reject-unsafe-delete'],
  'pos-sede':['create-order','retry-idempotent-payment','permission-boundary'],
  kardex:['query-movements','inventory-reconciliation'],
  veterinaria:['create-read-update-refresh-record','permission-boundary','error-recovery'],
  psicologia:['create-read-update-refresh-record','permission-boundary','error-recovery'],
  odontologia:['create-read-update-refresh-record','permission-boundary','error-recovery']
});

function defaultFlows(route){
  if(route.priority==='high'){
    if(route.family==='reporting')return['generate-filter-export','permission-boundary'];
    if(route.family==='commercial')return['create-read-update-refresh','permission-boundary'];
    if(route.family==='operations')return['primary-workflow','refresh-retry'];
    if(['health','fitness'].includes(route.family))return['create-read-update-refresh','permission-boundary'];
    if(['governance','admin'].includes(route.family))return['configuration-workflow','permission-boundary'];
    if(route.family==='food')return['primary-workflow','retry-recovery'];
    return['primary-workflow','error-recovery'];
  }
  return['primary-workflow'];
}
function flowsForRoute(route){return ERP_E2E_CRITICAL_FLOWS_V155[route.route]||defaultFlows(route);}

export const ERP_E2E_ROUTES_V155=Object.freeze(MODULE_VISUAL_CATALOG.map(({route,family,priority,label})=>({
  route,family,priority,label,criticalFlows:Object.freeze([...flowsForRoute({route,family,priority,label})])
})));

export function caseIdentityV155(item){return[item.route,item.state,item.role,item.viewport,item.criticalFlow].join('|');}

export function buildErpE2EMatrixV155(){
  return ERP_E2E_ROUTES_V155.flatMap((route)=>route.criticalFlows.flatMap((criticalFlow)=>ERP_E2E_STATES_V155.flatMap((state)=>ERP_E2E_ROLES_V155.flatMap((role)=>ERP_E2E_VIEWPORTS_V155.map((viewport)=>({
    route:route.route,family:route.family,priority:route.priority,criticalFlow,state,role,viewport:viewport.name,width:viewport.width,height:viewport.height,orientation:viewport.orientation
  }))))));
}

export function validateEvidenceMatrixV155(cases){
  const expected=buildErpE2EMatrixV155();const expectedByKey=new Map(expected.map((item)=>[caseIdentityV155(item),item]));const observed=new Set();const errors=[];
  if(!Array.isArray(cases))return{valid:false,errors:['CASES_NOT_ARRAY'],expectedTotal:expected.length,actualTotal:0};
  for(const item of cases){const key=caseIdentityV155(item);const canonical=expectedByKey.get(key);if(!canonical){errors.push(`UNKNOWN_CASE:${key}`);continue;}if(observed.has(key)){errors.push(`DUPLICATE_CASE:${key}`);continue;}observed.add(key);if(item.width!==canonical.width||item.height!==canonical.height||item.orientation!==canonical.orientation)errors.push(`VIEWPORT_GEOMETRY_MISMATCH:${key}`);}
  for(const key of expectedByKey.keys())if(!observed.has(key))errors.push(`MISSING_CASE:${key}`);
  return{valid:errors.length===0,errors,expectedTotal:expected.length,actualTotal:cases.length};
}

export const ERP_E2E_REQUIRED_ASSERTIONS_V155=Object.freeze([
  'route-rendered-or-controlled-rbac-denial',
  'no-uncaught-error',
  'no-document-horizontal-overflow',
  'no-hidden-mutation',
  'role-boundary-enforced',
  'tenant-boundary-enforced-where-applicable',
  'critical-action-observable',
  'offline-state-explicit',
  'stale-state-not-presented-as-live',
  'loading-state-terminates',
  'empty-state-actionable',
  'error-state-recoverable',
  'refresh-preserves-committed-state',
  'retry-does-not-duplicate-mutation',
  'long-data-boundary-layout',
  'keyboard-focus-observable',
  'light-dark-layout',
  'zoom-200-layout',
  'dialog-within-viewport',
  'no-interactive-occlusion',
  'touch-targets-mobile'
]);
