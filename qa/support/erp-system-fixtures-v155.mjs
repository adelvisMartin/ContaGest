const LONG='QA-LARGO-ÁÉÍÓÚ-漢字-🙂-'.repeat(8);
const MAX_AMOUNT=9876543210.99;
const now='2026-09-03T00:00:00.000Z';
const staleAt='2025-01-01T00:00:00.000Z';

export const ERP_QA_FIXTURE_CLASSIFICATION='SYNTHETIC_TEST_ONLY';

const samples={
  client:{id:'qa-client-1',name:'Cliente QA',displayName:'Cliente QA',rif:'J-00000000-1',email:'cliente@example.test',phone:'0412-0000000',status:'active',updatedAt:now},
  product:{id:'qa-product-1',sku:'QA-001',name:'Producto QA',description:'Producto sintético',stock:25,quantity:25,price:125.5,cost:90.25,status:'active',updatedAt:now},
  sale:{id:'qa-sale-1',number:'V-QA-0001',customerId:'qa-client-1',customerName:'Cliente QA',status:'open',subtotal:100,total:116,tax:16,date:'2026-09-03',updatedAt:now},
  purchase:{id:'qa-purchase-1',number:'C-QA-0001',supplierId:'qa-supplier-1',supplierName:'Proveedor QA',status:'open',subtotal:100,total:116,tax:16,date:'2026-09-03',updatedAt:now},
  bank:{id:'qa-bank-1',name:'Banco QA',accountNumber:'****0001',currency:'USD',balance:12345.67,status:'active',updatedAt:now},
  employee:{id:'qa-employee-1',fullName:'Empleado QA',email:'empleado@example.test',status:'active',salary:500,updatedAt:now},
  patient:{id:'qa-patient-1',kind:'human',displayName:'Paciente QA',firstName:'Paciente',lastName:'QA',email:'paciente@example.test',phone:'0412-0000001',updatedAt:now},
  appointment:{id:'qa-appointment-1',patientId:'qa-patient-1',patientName:'Paciente QA',date:'2026-09-03',time:'10:30',durationMinutes:50,status:'scheduled',reason:'Seguimiento QA',updatedAt:now},
  task:{id:'qa-task-1',title:'Tarea QA',status:'open',priority:'high',dueDate:'2026-09-04',updatedAt:now},
  audit:{id:'qa-audit-1',action:'QA_SYNTHETIC',actor:'qa@example.test',createdAt:now,entity:'fixture',updatedAt:now},
  ledger:{id:'qa-ledger-1',date:'2026-09-03',account:'1.1.01',debit:100,credit:0,description:'Asiento QA',updatedAt:now},
  report:{id:'qa-report-1',label:'Reporte QA',value:100,amount:100,currency:'USD',updatedAt:now}
};

function boundary(value){
  if(Array.isArray(value))return value.map((item,index)=>boundary({...item,id:`${item.id||'qa'}-boundary-${index}`}));
  if(!value||typeof value!=='object')return value;
  const out={...value};
  for(const[key,current]of Object.entries(out)){
    if(typeof current==='string'&&/(name|title|description|label|reason)/i.test(key))out[key]=LONG;
    if(typeof current==='number'&&/(amount|total|balance|price|cost|salary|debit|credit|quantity|stock|value)/i.test(key))out[key]=key==='credit'?-MAX_AMOUNT:MAX_AMOUNT;
  }
  return out;
}
function stale(value){
  if(Array.isArray(value))return value.map(stale);
  if(!value||typeof value!=='object')return value;
  return{...value,updatedAt:staleAt,lastSyncedAt:staleAt,stale:true,dataFreshness:'stale'};
}

function dataForPath(pathname){
  const p=pathname.toLowerCase();
  if(/patients/.test(p))return[samples.patient];
  if(/appointments/.test(p))return[samples.appointment];
  if(/clients|customers/.test(p))return[samples.client];
  if(/inventory|products|items|kardex|stock/.test(p))return[samples.product];
  if(/sales|ventas/.test(p))return[samples.sale];
  if(/purchases|compras|suppliers|proveedores/.test(p))return[samples.purchase];
  if(/bank|bancos|reconciliation/.test(p))return[samples.bank];
  if(/employees|payroll|nomina|rrhh/.test(p))return[samples.employee];
  if(/tasks/.test(p))return[samples.task];
  if(/audit/.test(p))return[samples.audit];
  if(/ledger|journal|accounting|accounts/.test(p))return[samples.ledger];
  if(/report|analytics|dashboard|metrics|summary|balance|statement|tax|tribut/.test(p))return[samples.report];
  if(/settings|config|license|module|profile|status/.test(p))return{id:'qa-config-1',status:'active',enabled:true,name:'Configuración QA',updatedAt:now};
  return[samples.report];
}

function mutationResult(pathname,body){const base=Array.isArray(dataForPath(pathname))?dataForPath(pathname)[0]:dataForPath(pathname);return{...base,...(body&&typeof body==='object'?body:{}),id:body?.id||base?.id||'qa-created-1',updatedAt:now};}

export function fixtureForRequest({url,method='GET',state='baseline',body=null}){
  const pathname=new URL(url,'http://qa.local').pathname;
  if(state==='role-denied')return{status:403,delayMs:0,body:{ok:false,error:'FORBIDDEN',message:'Acceso denegado por fixture QA.'}};
  if(state==='error')return{status:500,delayMs:0,body:{ok:false,error:'QA_SYNTHETIC_ERROR',message:'Fallo controlado de fixture QA.'}};
  const delayMs=state==='loading'?750:0;
  if(method!=='GET'&&method!=='HEAD')return{status:method==='POST'?201:200,delayMs,body:{ok:true,data:mutationResult(pathname,body)}};
  let data=state==='empty'?[]:dataForPath(pathname);
  if(state==='boundary')data=boundary(data);
  if(state==='stale')data=stale(data);
  return{status:200,delayMs,body:{ok:true,data,...(state==='stale'?{meta:{stale:true,lastSyncedAt:staleAt}}:{})}};
}

export function fixtureMetadata(){return{classification:ERP_QA_FIXTURE_CLASSIFICATION,containsRealPII:false,generatedForIssue:155};}
