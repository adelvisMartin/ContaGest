import { MODULE_VISUAL_CATALOG } from './module-visual-catalog.mjs';

// Post-merge verification contract. A route only becomes PASS when every
// applicable gate is backed by executed evidence on the same candidate SHA.
// `persistence` describes what the product itself claims to do; it is not a
// shortcut to mark a route PASS.
const SPEC = Object.freeze({
  dashboard:{persistence:'read',domain:'management'},
  cotizacion:{persistence:'workflow',domain:'commercial'},
  clientes:{persistence:'crud',domain:'commercial'},
  ventas:{persistence:'workflow',domain:'sales'},
  inventario:{persistence:'crud',domain:'inventory'},
  tributos:{persistence:'workflow',domain:'tax'},
  normativa:{persistence:'read',domain:'regulatory'},
  historial:{persistence:'read',domain:'audit-history'},
  reportes:{persistence:'read-export',domain:'reporting'},
  contabilidad:{persistence:'workflow',domain:'accounting'},
  'libro-mayor':{persistence:'read',domain:'accounting'},
  'balance-sumas-saldos':{persistence:'read',domain:'accounting'},
  'hoja-trabajo':{persistence:'working-paper',domain:'accounting'},
  'estados-financieros':{persistence:'read',domain:'accounting'},
  'cierre-contable':{persistence:'workflow',domain:'accounting'},
  bancos:{persistence:'workflow',domain:'banking'},
  nomina:{persistence:'workflow',domain:'payroll'},
  proveedores:{persistence:'crud',domain:'purchases'},
  compras:{persistence:'workflow',domain:'purchases'},
  auditoria:{persistence:'read',domain:'audit'},
  configuracion:{persistence:'settings',domain:'admin'},
  ayuda:{persistence:'none',domain:'support'},
  tasks:{persistence:'crud',domain:'tasks'},
  profile:{persistence:'settings',domain:'identity'},
  mobile:{persistence:'none',domain:'preview'},
  'libro-ventas':{persistence:'read-export',domain:'tax'},
  marca:{persistence:'none',domain:'design-system'},
  admin:{persistence:'workflow',domain:'rbac'},
  backend:{persistence:'read',domain:'operations'},
  vistas:{persistence:'none',domain:'module-catalog'},
  login:{persistence:'auth',domain:'auth'},
  'plan-cuentas':{persistence:'crud',domain:'accounting'},
  rrhh:{persistence:'workflow',domain:'hr'},
  analytics:{persistence:'read',domain:'analytics'},
  qr:{persistence:'workflow',domain:'inventory'},
  'inventario-scan':{persistence:'workflow',domain:'inventory'},
  pedidos:{persistence:'crud',domain:'food'},
  'pos-sede':{persistence:'workflow',domain:'food'},
  'tracking-pedidos':{persistence:'workflow',domain:'food'},
  'delivery-mapa':{persistence:'workflow',domain:'food'},
  'asistente-ia':{persistence:'workflow',domain:'ai'},
  soporte:{persistence:'none',domain:'support'},
  'demo-control':{persistence:'crud',domain:'governance'},
  'modulos-madurez':{persistence:'read',domain:'governance'},
  'reglas-negocio':{persistence:'read',domain:'governance'},
  licencias:{persistence:'workflow',domain:'licensing'},
  'importacion-data':{persistence:'preview-only',domain:'imports'},
  kardex:{persistence:'read',domain:'inventory'},
  'normativa-contable':{persistence:'read',domain:'accounting'},
  pretesting:{persistence:'read',domain:'governance'},
  salud:{persistence:'crud',domain:'care'},
  veterinaria:{persistence:'crud',domain:'veterinary'},
  psicologia:{persistence:'crud',domain:'psychology'},
  odontologia:{persistence:'crud',domain:'dentistry'},
  gimnasio:{persistence:'crud',domain:'fitness'},
  rutinas:{persistence:'crud',domain:'fitness'},
  nutricion:{persistence:'crud',domain:'fitness'},
  mensajes:{persistence:'crud',domain:'communications'}
});

export const VERIFICATION_GATES=Object.freeze(['visual','interaction','frontendE2E','backendPersistence','domain']);

export const MODULE_VERIFICATION_CATALOG=Object.freeze(MODULE_VISUAL_CATALOG.map((item)=>{
  const spec=SPEC[item.route];
  if(!spec)throw new Error(`Missing 58x5 verification spec for route ${item.route}`);
  return Object.freeze({...item,...spec,gates:VERIFICATION_GATES});
}));

if(Object.keys(SPEC).length!==MODULE_VISUAL_CATALOG.length){
  throw new Error(`Verification catalog mismatch: spec=${Object.keys(SPEC).length}, routes=${MODULE_VISUAL_CATALOG.length}`);
}

export const PERSISTENCE_REQUIRED=Object.freeze(MODULE_VERIFICATION_CATALOG.filter((item)=>!['none','read','read-export','working-paper','preview-only'].includes(item.persistence)).map((item)=>item.route));
