import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');
const routeSignatures=(source)=>[...source.matchAll(/router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)/g)]
  .map((match)=>`${match[1].toUpperCase()} ${match[2]}`);

const boundedRouteFiles=[
  'backend/src/modules/verticals/veterinary-inventory.routes.ts',
  'backend/src/modules/verticals/veterinary-overview.routes.ts',
  'backend/src/modules/verticals/veterinary-diagnostics.routes.ts',
  'backend/src/modules/verticals/veterinary-hospitalization.routes.ts',
  'backend/src/modules/verticals/veterinary-treatment-sheet.routes.ts',
  'backend/src/modules/verticals/veterinary-patients.routes.ts',
  'backend/src/modules/verticals/veterinary-guardian.routes.ts',
  'backend/src/modules/verticals/veterinary-communications.routes.ts',
  'backend/src/modules/verticals/veterinary-appointments.routes.ts',
  'backend/src/modules/verticals/veterinary-boarding.routes.ts',
  'backend/src/modules/verticals/veterinary-financial.routes.ts'
];

const expectedVeterinaryRoutes=[
  'GET /medication-products','POST /medications/prescriptions',
  'GET /clinical-inventory','POST /clinical-inventory/lots',
  'GET /clinical-inventory/consumptions','POST /clinical-inventory/consume',
  'GET /dashboard',
  'GET /lab-orders','POST /lab-orders','GET /lab-results','POST /lab-results',
  'GET /studies','POST /studies',
  'GET /hospitalizations','POST /hospitalizations','PATCH /hospitalizations/:id/status',
  'GET /hospitalizations/:id/treatment-sheet','POST /hospitalizations/:id/treatment-sheet',
  'GET /observations','POST /observations','GET /procedures','POST /procedures',
  'GET /guardian-portal/grants','POST /guardian-portal/grants','POST /guardian-portal/grants/:id/revoke',
  'GET /communications','POST /communications','PATCH /appointments/:id/status',
  'GET /boarding/settings','PATCH /boarding/settings',
  'GET /boarding/resources','POST /boarding/resources','PATCH /boarding/resources/:id/status',
  'GET /boarding/stays','POST /boarding/stays','PATCH /boarding/stays/:id/status',
  'GET /financial-cases/catalog','GET /financial-cases','POST /financial-cases',
  'POST /financial-cases/:id/authorize','POST /financial-cases/:id/attend',
  'GET /financial-cases/:id/consumptions','POST /financial-cases/:id/invoice'
];

test('64/75 preserves the complete veterinary route contract across bounded contexts',()=>{
  const actual=boundedRouteFiles.flatMap((path)=>routeSignatures(read(path)));
  assert.deepEqual(actual,expectedVeterinaryRoutes);
  assert.equal(new Set(actual).size,actual.length,'veterinary route ownership must not be duplicated');
});

test('64/75 keeps tenant and health permission authority above every veterinary child router',()=>{
  const source=read('backend/src/modules/verticals/veterinary.routes.ts');
  const boundary=source.indexOf("router.use(requireTenant, requirePermission('health.manage'))");
  assert.ok(boundary>0,'veterinary security boundary missing');
  assert.equal(routeSignatures(source).length,0,'aggregator must not own endpoint handlers');
  for(const path of boundedRouteFiles){
    const importName=path.split('/').pop().replace('veterinary-','').replace('.routes.ts','');
    assert.ok(source.includes('.routes.js'),`bounded router import missing for ${importName}`);
  }
  assert.ok(source.indexOf('router.use(inventoryRoutes)')>boundary);
  assert.ok(source.indexOf('router.use(financialRoutes)')>source.indexOf('router.use(inventoryRoutes)'));
  assert.doesNotMatch(source,/\$queryRaw|\$executeRaw|prisma\./,'aggregator must not contain persistence logic');
});

test('64/75 preserves veterinary patient and appointment CRUD paths behind the same parent guard',()=>{
  const aggregator=read('backend/src/modules/verticals/veterinary-crud.routes.ts');
  const actual=[
    ...routeSignatures(read('backend/src/modules/verticals/veterinary-crud-patients.routes.ts')),
    ...routeSignatures(read('backend/src/modules/verticals/veterinary-crud-appointments.routes.ts'))
  ];
  assert.deepEqual(actual,[
    'PATCH /health/patients/:id','DELETE /health/patients/:id',
    'PATCH /health/appointments/:id','DELETE /health/appointments/:id'
  ]);
  const boundary=aggregator.indexOf("router.use(requireTenant, requirePermission('health.manage'))");
  assert.ok(boundary>0);
  assert.ok(aggregator.indexOf('router.use(patientCrudRoutes)')>boundary);
  assert.ok(aggregator.indexOf('router.use(appointmentCrudRoutes)')>boundary);
  assert.equal(routeSignatures(aggregator).length,0);
});

test('64/75 turns VeterinaryWorkspace into an orchestrator and keeps one visual owner',()=>{
  const workspace=read('frontend/src/components/veterinary/VeterinaryWorkspace.jsx');
  const views=read('frontend/src/components/veterinary/VeterinaryWorkspaceViews.jsx');
  const dialogs=read('frontend/src/components/veterinary/VeterinaryWorkspaceDialogs.jsx');
  const primitives=read('frontend/src/components/veterinary/VeterinaryWorkspacePrimitives.jsx');
  const helpers=read('frontend/src/components/veterinary/veterinaryWorkspace.helpers.js');
  assert.ok(workspace.length<25_000,`workspace remains monolithic: ${workspace.length} chars`);
  assert.match(workspace,/VeterinaryWorkspacePrimitives\.jsx/);
  assert.match(workspace,/renderVeterinaryWorkspaceTab/);
  assert.match(workspace,/renderVeterinaryDialogFields/);
  assert.doesNotMatch(workspace,/const renderOverview=|const renderPatients=|const renderLabs=|const renderHospital=/);
  assert.equal((workspace.match(/cg-veterinary-workspace/g)||[]).length,1);
  for(const name of ['renderOverview','renderPatients','renderAgenda','renderHistory','renderLabs','renderStudies','renderHospital','renderProcedures','renderCommunications','renderFinance','renderGuardianPortal','renderBoarding']){
    assert.match(views,new RegExp(`const ${name}=`),`missing bounded view ${name}`);
  }
  assert.doesNotMatch(views,/useState\(|useEffect\(/,'view module must stay presentational');
  assert.doesNotMatch(views,/VeterinaryService|HealthVerticalService/,'view module must not own service calls');
  assert.match(workspace,/const dischargeHospitalization=async/);
  assert.match(workspace,/VeterinaryService\.updateHospitalizationStatus/);
  assert.match(views,/dischargeHospitalization/);
  assert.doesNotMatch(dialogs,/useState\(|useEffect\(/,'dialog module must stay presentational');
  assert.match(dialogs,/const patientSelect=/);
  assert.match(dialogs,/const professionalSelect=/);
  assert.match(dialogs,/const DateParts=/);
  assert.match(primitives,/export function SectionCard/);
  assert.match(primitives,/export function EntityLabel/);
  assert.match(workspace,/navigateToTab/);
  assert.match(views,/search,\s*setSearch,\s*navigateToTab,\s*openDialog/);
  assert.doesNotMatch(views,/\bsetTab\(/,'presentational views must not reach into workspace tab state');
  assert.doesNotMatch(views,/\bupdateUrl\(/,'presentational views must use the injected navigation callback');
  assert.match(primitives,/from '.\/veterinaryWorkspace\.helpers\.js'/);
  for(const name of ['TABS','STATUS_TONE','MONTHS','compactDate','onlyDate','phoneDigits','displayError','arrayData','objectData','shortCode','localDateTime','localDateTimeFromIso']){
    assert.doesNotMatch(primitives,new RegExp(`export const ${name}\\s*=`),`helper authority duplicated in primitives: ${name}`);
  }
  assert.match(helpers,/export const TABS\s*=/);
});

test('64/75 does not reintroduce bypasses while decomposing the vertical',()=>{
  const sources=[
    ...boundedRouteFiles,
    'backend/src/modules/verticals/veterinary-crud.routes.ts',
    'backend/src/modules/verticals/veterinary-crud-patients.routes.ts',
    'backend/src/modules/verticals/veterinary-crud-appointments.routes.ts',
    'frontend/src/components/veterinary/VeterinaryWorkspace.jsx',
    'frontend/src/components/veterinary/VeterinaryWorkspaceViews.jsx',
    'frontend/src/components/veterinary/VeterinaryWorkspaceDialogs.jsx'
  ].map(read).join('\n');
  assert.doesNotMatch(sources,/\.catch\(\(\)=>null\)|waitForTimeout|test\.skip|test\.only/);
});


test('64/75 guardian portal keeps token hashing inside its bounded owner',()=>{
  const source=read('backend/src/modules/verticals/veterinary-guardian.routes.ts');
  assert.match(source,/import \{ createHash, randomBytes \} from 'node:crypto'/);
  assert.match(source,/const sha256=\(value:string\)=>createHash\('sha256'\)/);
  assert.match(source,/const tokenSha256=sha256\(portalToken\)/);
});
