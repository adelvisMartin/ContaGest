import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');
const page=(name)=>read('frontend','src','pages',name);

const expectedRoutes=[
  'dashboard','mobile','login','ventas','cotizacion','clientes','historial','pos-sede','pedidos','tracking-pedidos','delivery-mapa','tasks',
  'inventario','inventario-scan','kardex','qr','proveedores','compras','contabilidad','plan-cuentas','libro-mayor','balance-sumas-saldos',
  'hoja-trabajo','estados-financieros','cierre-contable','bancos','normativa-contable','tributos','libro-ventas','normativa','nomina','rrhh',
  'salud','veterinaria','psicologia','odontologia','gimnasio','rutinas','nutricion','mensajes','analytics','reportes','auditoria','configuracion',
  'backend','admin','marca','demo-control','licencias','importacion-data','reglas-negocio','modulos-madurez','pretesting','vistas','profile',
  'asistente-ia','soporte','ayuda'
];

test('pre-QA v16 covers all 58 registered runtime routes',()=>{
  assert.equal(expectedRoutes.length,58);
  assert.equal(new Set(expectedRoutes).size,58);
  const app=read('frontend','src','app.js');
  const catalog=read('frontend','src','data','moduleCatalog.js');
  for(const route of expectedRoutes){
    assert.match(app,new RegExp(`(?:^|[,\\s])['\"]?${route.replaceAll('-','\\-')}['\"]?\\s*:`),`runtime registry missing ${route}`);
    if(route!=='login')assert.match(catalog,new RegExp(`route:'${route.replaceAll('-','\\-')}'`),`module catalog missing ${route}`);
  }
  assert.doesNotMatch(catalog,/route:'login'/,'login is intentionally runtime-only, not a licensed module');
});

test('legacy visual hotspots migrated to canonical contracts',()=>{
  const regulatory=page('RegulatoryPage.js');
  const audit=page('AuditPage.js');
  const hr=page('HrDashboardPage.js');
  for(const [name,source] of [['Regulatory',regulatory],['Audit',audit],['RRHH',hr]]){
    assert.doesNotMatch(source,/rounded-\[|text-\[#|font-black|material-symbols|\bpl-card\b|\bds-btn\b/,`${name} retains legacy visual markup`);
    assert.match(source,/components\/ui\/index\.js/);
  }
});

test('Gym layout uses the reusable wide-card contract, not inline geometry',()=>{
  const gym=page('GymManagementPage.js');
  const adapters=read('frontend','src','styles','module-adapters.css');
  assert.doesNotMatch(gym,/style=["']grid-column:1\/-1["']/);
  assert.match(gym,/cg-gym-wide/);
  assert.match(adapters,/\.cg-gym-wide\s*\{\s*grid-column:1\/-1;/);
});

test('pretesting and module maturity never present heuristic scores as QA PASS',()=>{
  for(const source of [page('PretestingDashboardPage.js'),page('ModuleMaturityPage.js')]){
    assert.match(source,/NOT_EXECUTED/);
    assert.match(source,/NO QA PASS/);
    assert.match(source,/no (?:certifican|son resultados)|No son resultados|no certifica/i);
  }
});

test('Sales Book never reconstructs fiscal base or IVA from an assumed 16 percent rate',()=>{
  const source=page('SalesBookPage.js');
  assert.doesNotMatch(source,/\/\s*1\.16|\*\s*\.16|IVA 16%/);
  assert.match(source,/numberOrNull/);
  assert.match(source,/fiscalIssues/);
  assert.match(source,/Exportación fiscal bloqueada/);
  assert.match(source,/Base imponible registrada/);
});

test('Worksheet labels local adjustments as working papers, not posted entries',()=>{
  const source=page('WorksheetPage.js');
  assert.match(source,/NO POSTEADO/);
  assert.match(source,/postingState:'unposted_working_paper'/);
  assert.match(source,/NO se registró ningún asiento/);
});

test('Chart of Accounts creates tenant data through backend and enforces permissions',()=>{
  const pageSource=page('ChartAccountsPage.js');
  const client=read('frontend','src','services','chartAccountsService.js');
  const backend=read('backend','src','modules','chart-accounts','chart-accounts.routes.ts');
  assert.match(pageSource,/ChartAccountsService\.create/);
  assert.doesNotMatch(pageSource,/uid\('acc'\)/);
  assert.match(client,/BackendApi\.post\('\/chart-accounts'/);
  assert.match(backend,/requirePermission\('accounting\.view'\)/);
  assert.match(backend,/requirePermission\('accounting\.post'\)/);
  assert.match(backend,/tenantId/);
});

test('Accounting close bootstrap is deduplicated and only marks loaded after backend success',()=>{
  const source=page('AccountingClosePage.js');
  assert.match(source,/let periodsLoadPromise=null/);
  assert.match(source,/if\(periodsLoadPromise\)return periodsLoadPromise/);
  assert.match(source,/periodsLoaded=true/);
  assert.doesNotMatch(source,/load\(\{silent:true\}\)\.then\(\(\)=>Store\.update/);
});

test('previous v16 financial safety fixes remain in place',()=>{
  const payroll=read('backend','src','modules','payroll','payroll.routes.ts');
  const banking=page('BankingPage.js');
  const dataImport=page('DataImportPage.js');
  const qr=page('QrBarcodePage.js');
  assert.match(payroll,/paid:\[\]/);
  assert.match(payroll,/cancelled:\[\]/);
  assert.match(payroll,/Transición de nómina no permitida/);
  assert.doesNotMatch(banking,/removeMovement|data-delete-bank-movement/);
  assert.doesNotMatch(dataImport,/Aplicar importación validada/);
  assert.doesNotMatch(qr,/server-side-hash-pendiente/);
});
