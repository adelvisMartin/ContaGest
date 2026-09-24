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
  const registry=read('frontend','src','data','pageRegistry.js');
  const catalog=read('frontend','src','data','moduleCatalog.js');
  const accessManifest=JSON.parse(read('backend','src','shared','contracts','access-manifest.json'));
  const licensedRoutes=new Set((accessManifest.modules||[]).map((item)=>item.route));
  const visualCatalog=read('qa','support','module-visual-catalog.mjs');
  for(const route of expectedRoutes){
    assert.match(registry,new RegExp(`(?:^|[,\\s])['\"]?${route.replaceAll('-','\\-')}['\"]?\\s*:`),`runtime registry missing ${route}`);
    assert.match(visualCatalog,new RegExp(`route:'${route.replaceAll('-','\\-')}'`),`visual audit catalog missing ${route}`);
    if(route!=='login')assert.ok(licensedRoutes.has(route),`access manifest missing licensed route ${route}`);
  }
  assert.match(catalog,/accessManifest/,'module catalog must remain derived from canonical access manifest');
  assert.ok(!licensedRoutes.has('login'),'login is intentionally runtime-only, not a licensed module');
});

test('legacy visual hotspots migrated to canonical contracts',()=>{
  const targets=[
    ['Regulatory',page('RegulatoryPage.js')],
    ['Audit',page('AuditPage.js')],
    ['RRHH',page('HrDashboardPage.js')],
    ['Demo Control',page('DemoControlPage.js')]
  ];
  for(const [name,source] of targets){
    assert.doesNotMatch(source,/rounded-\[|text-\[#|font-black|material-symbols|\bpl-card\b|\bds-btn\b/,`${name} retains legacy visual markup`);
    assert.match(source,/components\/ui\/index\.js/);
  }
});

test('Gym layout is React/Cg/MUI and keeps wide-section geometry declarative',()=>{
  const gym=page('GymManagementPage.jsx');
  assert.match(gym,/createRoot\(/);
  assert.match(gym,/CgProvider/);
  assert.match(gym,/CgPageHeader/);
  assert.match(gym,/gridColumn:wide\?'1\/-1':undefined/);
  assert.doesNotMatch(gym,/components\/ui\/index\.js|mountSubmit|innerHTML|querySelector|addEventListener|MutationObserver/);
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
  assert.doesNotMatch(client,/x-tenant-id/i);
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

test('exports use the secure shared API client instead of dev tenant headers or localhost',()=>{
  const source=read('frontend','src','services','exportService.js');
  assert.match(source,/BackendApi\.request\(endpoint/);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.doesNotMatch(source,/x-tenant-id|contagest_tenant_id|localhost:3030/);
});

test('Demo Control persists through authenticated API and never reports an offline save as success',()=>{
  const service=read('frontend','src','services','demoAccessService.js');
  const view=page('DemoControlPage.js');
  assert.match(service,/BackendApi\.post\('\/demos\/access'/);
  assert.match(service,/BackendApi\.get\('\/demos\/access'/);
  assert.doesNotMatch(service,/\/api\/v1\/demos\/access/);
  assert.doesNotMatch(service,/offline:\s*true/);
  assert.match(view,/await DemoAccessService\.saveDemo/);
  assert.match(view,/await RbacService\.updateDemoUser/);
  assert.match(view,/actualizado y persistido en RBAC/);
});

test('canonical icon helper preserves Font Awesome family instead of forcing fa-solid',()=>{
  const kit=read('frontend','src','components','ui','kit.js');
  assert.match(kit,/const faFamilies\s*=\s*new Set/);
  assert.match(kit,/family=tokens\.find/);
  assert.ok(kit.includes('class="${safe(spec.family)} ${safe(spec.icon)} ${safe(className)}"'));
  assert.ok(!kit.includes('class="fa-solid ${safe(fa)}'));
});

test('source gates cover functional bindings plus buttons and icons before Vite build',()=>{
  const frontendPackage=JSON.parse(read('frontend','package.json'));
  assert.match(frontendPackage.scripts['preqa:source'],/visual-source-gate-v16\.mjs/);
  assert.match(frontendPackage.scripts['preqa:source'],/erp-functional-source-gate-v16\.mjs/);
  assert.match(frontendPackage.scripts['preqa:source'],/ui-control-audit-v16\.mjs/);
  assert.match(frontendPackage.scripts.build,/preqa:source.*stage:backend.*vite build/);
});

test('previous v16 financial safety fixes remain in place',()=>{
  const payroll=read('backend','src','modules','payroll','payroll.routes.ts');
  const banking=page('BankingPage.jsx');
  const dataImport=page('DataImportPage.js');
  const qr=page('QrBarcodePage.js');
  assert.match(payroll,/paid:\s*\[\s*\]/);
  assert.match(payroll,/cancelled:\s*\[\s*\]/);
  assert.match(payroll,/Transición de nómina no permitida/);
  assert.doesNotMatch(banking,/removeMovement|data-delete-bank-movement/);
  assert.doesNotMatch(dataImport,/Aplicar importación validada/);
  assert.doesNotMatch(qr,/server-side-hash-pendiente/);
});

test('production secret guard runs before parsing and every business router while health and CSP reporting stay independent',()=>{
  const app=read('backend','src','app.ts');
  const guard=app.indexOf('app.use(enforceProductionSecrets)');
  assert.ok(guard>0,'production secret guard must be mounted');
  const businessJson=app.indexOf('app.use(express.json({');
  assert.ok(businessJson>guard,'production secret guard must reject a misconfigured deployment before parsing business JSON bodies');
  for(const marker of [
    "app.use('/api/v1/hipico/system'",
    "app.use('/api/v1/hipico-bot'",
    "app.use('/api/v1/hipico/documents'",
    "'/api/v1/hipico',",
    "app.use('/api/v1/auth'",
    "app.use('/api/v1', mutationRateLimit"
  ]){
    const index=app.indexOf(marker);
    assert.ok(index>guard,`${marker} must run after production secret enforcement`);
  }
  assert.ok(app.indexOf('registerHealthRoutes')<guard,'health probes must remain available before secret enforcement');
  assert.ok(app.indexOf("'/api/v1/security/csp-report'")<guard,'CSP reporting must remain available before secret enforcement');
});


test('58x5 browser harness tracks current Login shell and executes real route batches',()=>{
  const loginPage=page('LoginPage.js');
  const loginSpec=read('qa','login-auth-runtime-v161.spec.mjs');
  const mobileSpec=read('qa','mobile-navigation-v163.spec.mjs');
  const runner=read('scripts','vercel-browser-preqa-v16.mjs');
  const rootPackage=JSON.parse(read('package.json'));

  assert.match(loginPage,/login-shell-v162/);
  assert.match(loginSpec,/locator\('\.login-shell'\)/);
  assert.doesNotMatch(loginSpec,/login-shell-v161/);
  assert.match(mobileSpec,/fill\('ayuda'\)/);
  assert.match(mobileSpec,/toBe\('ayuda'\)/);

  assert.match(runner,/2\/51 vertical Wave A geometry/);
  assert.match(runner,/qa\/erp-ui-wave-a-v251\.spec\.mjs/);
  assert.doesNotMatch(runner,/pattern=\`\^\(\?:/,'batch grep must match Playwright full titles instead of anchoring at string start');
  assert.doesNotMatch(runner,/runCommandGate\('REAL BACKEND \/ POSTGRES PERSISTENCE'/);
  assert.doesNotMatch(runner,/runCommandGate\('REAL FINANCIAL DOMAIN'/);

  assert.equal(rootPackage.scripts['test:backend:persistence:real'],'npm --workspace backend exec -- tsx --test ../qa/postmerge-backend-persistence-v17.test.ts');
  assert.equal(rootPackage.scripts['test:backend:financial:real'],'npm --workspace backend exec -- tsx --test ../qa/postmerge-financial-domain-v17.test.ts');
});


test('Ledger printable book uses external stylesheet and never injects runtime style blocks',()=>{
  const ledger=page('LedgerPage.jsx');
  const printCss=read('frontend','public','print','ledger-book.css');
  assert.match(ledger,/\/print\/ledger-book\.css/);
  assert.doesNotMatch(ledger,/<style(?:\s|>)/i);
  assert.match(printCss,/table\s*\{/);
  assert.match(printCss,/@media\s+print/);
});
