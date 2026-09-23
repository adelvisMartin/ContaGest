import fs from 'node:fs';
import path from 'node:path';
import { ERP_UI_WAVE_A_2_51, ERP_UI_MIGRATION_STATUSES } from '../qa/support/erp-ui-wave-a-v251.mjs';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const root=process.cwd();
const fail=(message)=>{console.error(`[erp-ui-wave-a][FAIL] ${message}`);process.exitCode=1;};
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const count=(source,re)=>(source.match(re)||[]).length;
const countNamedImport=(source,symbol)=>count(
  source,
  new RegExp(`import\\s*\\{\\s*${symbol}\\s*\\}\\s*from\\s*['"][^'"]+['"]`,'g')
);
const metrics=(source)=>({
  kitImport:count(source,/components\/ui\/index\.js/g),
  rawButtonString:count(source,/<button\b/g),
  rawInputString:count(source,/<input\b/g),
  rawSelectString:count(source,/<select\b/g),
  rawTextareaString:count(source,/<textarea\b/g),
  cgxBtn:count(source,/cgx-btn/g),
  legacyVetImport:count(source,/VeterinaryClinicLegacy/g)
});

const expectedRoutes=['odontologia','veterinaria','gimnasio','rutinas','nutricion'];
if(JSON.stringify(ERP_UI_WAVE_A_2_51.map((item)=>item.route))!==JSON.stringify(expectedRoutes))fail('Wave A route set drift');
if(new Set(ERP_UI_WAVE_A_2_51.map((item)=>item.route)).size!==expectedRoutes.length)fail('Wave A routes must be unique');

const sourceCache=new Map();
for(const item of ERP_UI_WAVE_A_2_51){
  if(!ERP_UI_MIGRATION_STATUSES.includes(item.status))fail(`${item.route}: invalid migration status ${item.status}`);
  const registry=PAGE_REGISTRY[item.route];
  if(!registry)fail(`${item.route}: missing from canonical page registry`);
  else if(`frontend/src/${registry[0].replace(/^\.\//,'')}`!==item.renderer)fail(`${item.route}: renderer manifest drift`);

  if(item.status==='LEGACY_EXCEPTION_APPROVED'){
    if(!item.exception?.owner||!item.exception?.reason||!item.exception?.approvedAt||!item.exception?.reviewBy)fail(`${item.route}: incomplete legacy exception`);
  }
  if(item.status==='MIGRATED'&&item.exception)fail(`${item.route}: migrated route cannot keep a legacy exception`);

  if(!sourceCache.has(item.renderer))sourceCache.set(item.renderer,read(item.renderer));
  const source=sourceCache.get(item.renderer);
  const actual=metrics(source);
  for(const [key,max] of Object.entries(item.legacyBudget||{})){
    if((actual[key]??0)>max)fail(`${item.route}: new legacy ${key}=${actual[key]} exceeds approved budget ${max}`);
  }
}

const vetEntry=ERP_UI_WAVE_A_2_51.find((item)=>item.route==='veterinaria');
const vet=sourceCache.get('frontend/src/pages/VeterinaryClinicPageV1123.jsx');
for(const primitive of ['CgProvider','CgButton','CgTextField','CgState','CgStatusChip']){
  if(!vet.includes(primitive))fail(`veterinaria: missing canonical primitive ${primitive}`);
}
for(const forbidden of ['ThemeProvider','createContaGestMuiTheme']){
  if(vet.includes(forbidden))fail(`veterinaria: direct theme owner reintroduced: ${forbidden}`);
}
if(vetEntry?.status==='MIGRATED'){
  if(/VeterinaryClinicLegacy|\.render\(state,ctx\)|\.mount\(state,ctx\)/.test(vet))fail('veterinaria: migrated route reintroduced legacy lifecycle composition');
  if((vet.match(/createRoot\(/g)||[]).length!==1)fail('veterinaria: migrated route must own exactly one React root');
  if(!/import \{ VeterinaryWorkspace \} from '\.\.\/components\/veterinary\/VeterinaryWorkspace\.jsx'/.test(vet))fail('veterinaria: migrated route must compose the rootless VeterinaryWorkspace component');
  const veterinaryWorkspace=read('frontend/src/components/veterinary/VeterinaryWorkspace.jsx');
  if(/createRoot\(|CgProvider|export const VeterinaryClinicPage|veterinaryClinicRoot/.test(veterinaryWorkspace))fail('veterinaria: VeterinaryWorkspace must remain rootless and provider-free');
  if(!/export function VeterinaryWorkspace/.test(veterinaryWorkspace))fail('veterinaria: rootless VeterinaryWorkspace export missing');
  if(fs.existsSync(path.join(root,'frontend/src/pages/VeterinaryClinicPage.jsx')))fail('veterinaria: superseded second page owner still exists');
  if(/\.catch\(\s*\(?.*?\)?\s*=>\s*null\s*\)|catch\s*\{\s*\}/s.test(vet))fail('veterinaria: page owner reintroduced silent error swallowing');
  if(/\.catch\(\s*\(?.*?\)?\s*=>\s*null\s*\)|catch\s*\{\s*\}/s.test(veterinaryWorkspace))fail('veterinaria: workspace reintroduced silent error swallowing');
  for(const contract of ['loadError','historyError','saveError','reportVeterinaryError','Reintentar']){
    if(!vet.includes(contract))fail(`veterinaria: missing dossier error-handling contract ${contract}`);
  }
  for(const contract of ['baseError','patientDataError','actionError','reportVeterinaryError','Se conserva la última información válida','Reintentar']){
    if(!veterinaryWorkspace.includes(contract))fail(`veterinaria: missing workspace error-handling contract ${contract}`);
  }
  const veterinaryErrorReporter=read('frontend/src/components/veterinary/veterinaryError.js');
  for(const contract of ['scope','name','message','status']){
    if(!veterinaryErrorReporter.includes(contract))fail(`veterinaria: missing safe error reporter contract ${contract}`);
  }
  if(/JSON\.stringify|clinicalData|patient|form/.test(veterinaryErrorReporter))fail('veterinaria: safe error reporter must not serialize clinical payloads');
  for(const childPath of [
    'frontend/src/components/veterinary/VeterinaryLongitudinalRecord.jsx',
    'frontend/src/components/veterinary/VeterinaryPreventiveCarePanel.jsx',
    'frontend/src/components/veterinary/VeterinaryTreatmentSheet.jsx',
    'frontend/src/components/veterinary/VeterinaryMedicationPanel.jsx',
    'frontend/src/components/veterinary/VeterinaryClinicalInventoryPanel.jsx'
  ]){
    const child=read(childPath);
    if(!child.includes('reportVeterinaryError'))fail(`veterinaria: child surface lacks safe error reporting: ${childPath}`);
    if(/\.catch\(\s*\(?.*?\)?\s*=>\s*null\s*\)|catch\s*\{\s*\}/s.test(child))fail(`veterinaria: child surface reintroduced silent error swallowing: ${childPath}`);
  }
  const veterinaryMedicationErrorSurface=read('frontend/src/components/veterinary/VeterinaryMedicationPanel.jsx');
  for(const contract of ['loadProducts','preserveOnError','productPermissionBlocked','productsLoading','Reintentar']){
    if(!veterinaryMedicationErrorSurface.includes(contract))fail(`veterinaria: medication error surface missing retry/fail-soft contract ${contract}`);
  }
  const veterinaryLongitudinal=read('frontend/src/components/veterinary/VeterinaryLongitudinalRecord.jsx');
  if(!vet.includes('VeterinaryLongitudinalRecord'))fail('veterinaria: longitudinal clinical record is not composed');
  if((vet.match(/<VeterinaryLongitudinalRecord/g)||[]).length!==1)fail('veterinaria: longitudinal clinical record must render from one owner');
  if(/querySelector|addEventListener|innerHTML|document\./.test(veterinaryLongitudinal))fail('veterinaria: longitudinal record reintroduced imperative DOM lifecycle');
  for(const contract of ['Problemas activos','Alergias','Diagnósticos','Tratamientos','Peso','Temperatura','Frecuencia cardíaca','Frecuencia respiratoria','trendDelta']){
    if(!veterinaryLongitudinal.includes(contract))fail(`veterinaria: missing longitudinal record contract ${contract}`);
  }
  if(!vet.includes('HealthVerticalService.measurements(patientId)'))fail('veterinaria: dossier must load canonical longitudinal measurements');
  for(const contract of ['nextVitalBatchId','batchId','createVeterinaryVitalMeasurements','batch atómico y reintentable','Number.isFinite']){
    if(!veterinaryLongitudinal.includes(contract))fail(`veterinaria: missing retry-safe longitudinal vital contract ${contract}`);
  }
  if(veterinaryLongitudinal.includes('HealthVerticalService.createMeasurement('))fail('veterinaria: longitudinal vital UI must not reintroduce partial per-measurement writes');
  const healthRoutes=read('backend/src/modules/verticals/health.routes.ts');
  for(const contract of [
    'veterinaryVitalBatchSchema',
    "router.post('/health/measurements/veterinary-vitals'",
    'pg_advisory_xact_lock',
    '"kind"=\'animal\'',
    "metadata\"->>'source'='veterinary-longitudinal-record'",
    "metadata\"->>'batchId'=$3",
    'El batchId ya fue usado para una toma de signos vitales diferente.',
    'result.replayed?200:201'
  ]){
    const normalized=contract.replaceAll('\\"','"');
    if(!healthRoutes.includes(normalized))fail(`veterinaria: missing longitudinal vital backend contract ${normalized}`);
  }
  const longitudinalBatchMigration=read('backend/prisma/migrations/20260923014000_veterinary_longitudinal_batch_v2351/migration.sql');
  for(const contract of ['CareMeasurement_vet_batch_kind_unique','"tenantId"','"patientId"',"(metadata->>'batchId')",'"kind"',"'veterinary-longitudinal-record'"]){
    if(!longitudinalBatchMigration.includes(contract))fail(`veterinaria: missing longitudinal batch migration contract ${contract}`);
  }
  const veterinaryPreventive=read('frontend/src/components/veterinary/VeterinaryPreventiveCarePanel.jsx');
  if(!vet.includes('VeterinaryPreventiveCarePanel'))fail('veterinaria: preventive care panel is not composed');
  if((vet.match(/<VeterinaryPreventiveCarePanel/g)||[]).length!==1)fail('veterinaria: preventive care panel must render from one owner');
  if(/querySelector|addEventListener|innerHTML|document\./.test(veterinaryPreventive))fail('veterinaria: preventive panel reintroduced imperative DOM lifecycle');
  for(const contract of ['Vacunas','Desparasitación','Control preventivo','Próximos vencimientos','Recordatorio','Anticipación','preventive_due_reminder']){
    if(!veterinaryPreventive.includes(contract))fail(`veterinaria: missing preventive care contract ${contract}`);
  }
  if(!vet.includes('HealthVerticalService.immunizations(patientId)'))fail('veterinaria: dossier must load canonical immunization history');
  const veterinarySoap=read('frontend/src/components/veterinary/veterinarySoapTemplates.js');
  for(const contract of ['SOAP_TEMPLATE_VERSION','canine','feline','wellness','problem','follow_up','emergency','resolveVeterinarySoapTemplate']){
    if(!veterinarySoap.includes(contract))fail(`veterinaria: missing SOAP template contract ${contract}`);
  }
  for(const contract of ['Plantilla SOAP','Tipo de consulta','Aplicar plantilla','soapTemplateId','soapTemplateVersion']){
    if(!veterinaryWorkspace.includes(contract))fail(`veterinaria: missing SOAP workspace contract ${contract}`);
  }
  if(!veterinaryWorkspace.includes('clinicalData:{soapTemplate:'))fail('veterinaria: SOAP template provenance must persist in CareEncounter clinicalData');
  for(const contract of ['availableLabTests','Prueba ordenada','resultId','referenceMin','referenceMax','Capturar resultado','isLabResultPending','Pendiente']){
    if(!veterinaryWorkspace.includes(contract))fail(`veterinaria: missing complete lab UI contract ${contract}`);
  }
  if(/label="Bandera"|name="flag"|verifiedBy:field/.test(veterinaryWorkspace))fail('veterinaria: client must not override laboratory flag/verifier authority');
  const veterinaryRoutes=read('backend/src/modules/verticals/veterinary.routes.ts');
  for(const contract of [
    'const order = await prisma.$transaction',
    'resultId: z.string().min(10).optional().nullable()',
    'FOR UPDATE',
    "order.status==='cancelled'",
    "order.status==='completed'",
    'Prueba ordenada no encontrada o ya fue informada.',
    'const verifier=ctx(req).email||ctx(req).userId||null',
    'pendingCount===0?\'completed\':\'processing\'',
    'p."tenantId"=o."tenantId"',
    'r."tenantId"=o."tenantId"'
  ]){
    if(!veterinaryRoutes.includes(contract))fail(`veterinaria: missing complete lab backend contract ${contract}`);
  }
  if(/verifiedBy:\s*optionalText|flag:\s*z\.enum/.test(veterinaryRoutes))fail('veterinaria: lab result schema reintroduced client verifier/flag authority');
  const orderedResultStart=veterinaryRoutes.indexOf('if(body.resultId){');
  const orderedResultEnd=veterinaryRoutes.indexOf('}else{',orderedResultStart);
  const orderedResultBlock=veterinaryRoutes.slice(orderedResultStart,orderedResultEnd);
  if(/SET[\s\S]*"testCode"=|SET[\s\S]*"testName"=|SET[\s\S]*"referenceMin"=|SET[\s\S]*"referenceMax"=/.test(orderedResultBlock))fail('veterinaria: ordered lab result must not rewrite ordered test metadata');

  const veterinaryTreatmentSheet=read('frontend/src/components/veterinary/VeterinaryTreatmentSheet.jsx');
  if((veterinaryWorkspace.match(/<VeterinaryTreatmentSheet/g)||[]).length!==1)fail('veterinaria: treatment sheet must render exactly once');
  if((veterinaryWorkspace.match(/import \{ VeterinaryTreatmentSheet \}/g)||[]).length!==1)fail('veterinaria: treatment sheet must have one owner import');
  if(/querySelector|addEventListener|innerHTML|document\./.test(veterinaryTreatmentSheet))fail('veterinaria: treatment sheet reintroduced imperative DOM lifecycle');
  for(const contract of ['Hoja de tratamiento','Medicacion','Observacion','Alimentacion','Fluidos','Tarea','Responsable','Programado','Realizado','Omitido','Cancelado','scheduledAt','performedAt','responsibleProfessionalId']){
    if(!veterinaryTreatmentSheet.includes(contract))fail(`veterinaria: missing treatment-sheet UI contract ${contract}`);
  }
  for(const contract of ['VeterinaryService.treatmentSheet(','VeterinaryService.createTreatmentSheetEntry(']){
    if(!veterinaryTreatmentSheet.includes(contract))fail(`veterinaria: missing treatment-sheet service wiring ${contract}`);
  }
  if(/calculateDose|recommendDose|autoDose|doseRecommendation/.test(veterinaryTreatmentSheet))fail('veterinaria: treatment sheet must not recommend medication doses');
  for(const contract of [
    'treatmentSheetEntrySchema',
    "router.get('/hospitalizations/:id/treatment-sheet'",
    "router.post('/hospitalizations/:id/treatment-sheet'",
    "category: z.enum(['medication','feeding','fluid','task','observation','vitals'])",
    "status: z.enum(['scheduled','completed','skipped','cancelled'])",
    'responsibleProfessionalId',
    'scheduledAt',
    'performedAt',
    'actorUserId:ctx(req).userId||null',
    'actorEmail:ctx(req).email||null',
    'FOR UPDATE OF h',
    'treatmentSheetVersion'
  ]){
    if(!veterinaryRoutes.includes(contract))fail(`veterinaria: missing treatment-sheet backend contract ${contract}`);
  }
  if(/UPDATE public\."CareHospitalObservation"|DELETE FROM public\."CareHospitalObservation"/.test(veterinaryRoutes))fail('veterinaria: treatment-sheet events must remain append-only');

  const inpatientVitalMigration=read('backend/prisma/migrations/20260923155000_veterinary_longitudinal_inpatient_v2351/migration.sql');
  for(const contract of [
    'VETERINARY_TREATMENT_VITAL_UNITS',
    "body.category==='vitals'",
    "body.status==='completed'",
    "source:'veterinary-treatment-sheet'",
    'sourceObservationId:row.id',
    'INSERT INTO public."CareMeasurement"',
    'hospitalization.encounterId'
  ]){
    if(!veterinaryRoutes.includes(contract))fail(`veterinaria: missing inpatient longitudinal vital contract ${contract}`);
  }
  for(const contract of ['Temperatura (°C)','Frecuencia cardíaca (lpm)','Frecuencia respiratoria (rpm)','Peso (kg)']){
    if(!veterinaryTreatmentSheet.includes(contract))fail(`veterinaria: treatment sheet missing canonical longitudinal vital input ${contract}`);
  }
  for(const contract of ['CareMeasurement_vet_treatment_observation_kind_unique',"metadata->>'sourceObservationId'","'veterinary-treatment-sheet'"]){
    if(!inpatientVitalMigration.includes(contract))fail(`veterinaria: missing inpatient vital uniqueness contract ${contract}`);
  }

  const veterinaryMedication=read('frontend/src/components/veterinary/VeterinaryMedicationPanel.jsx');
  const veterinaryMedicationMigration=read('backend/prisma/migrations/20260922214500_veterinary_medication_integration_v2851/migration.sql');
  const healthExtendedRoutes=read('backend/src/modules/verticals/health-extended.routes.ts');
  if((veterinaryWorkspace.match(/<VeterinaryMedicationPanel/g)||[]).length!==1)fail('veterinaria: medication panel must render exactly once');
  if((veterinaryWorkspace.match(/import \{ VeterinaryMedicationPanel \}/g)||[]).length!==1)fail('veterinaria: medication panel must have one owner import');
  if(/querySelector|addEventListener|innerHTML|document\./.test(veterinaryMedication))fail('veterinaria: medication panel reintroduced imperative DOM lifecycle');
  for(const contract of ['Medicación integrada','Prescripción','Dosis','Frecuencia','Duración','Etiqueta clínica','Producto de inventario (opcional)','VeterinaryService.medicationProducts(','VeterinaryService.createMedicationPrescription(']){
    if(!veterinaryMedication.includes(contract))fail(`veterinaria: missing medication integration UI contract ${contract}`);
  }
  if(/calculateDose|recommendDose|autoDose|doseRecommendation/.test(veterinaryMedication))fail('veterinaria: medication integration must not calculate or recommend doses');
  if(veterinaryWorkspace.includes("case'prescription':")||veterinaryWorkspace.includes("openDialog('prescription')"))fail('veterinaria: legacy prescription dialog must not coexist with integrated medication owner');
  for(const contract of [
    'veterinaryMedicationPrescriptionSchema',
    "router.get('/medication-products'",
    "requirePermission('inventory.manage')",
    "router.post('/medications/prescriptions'",
    'labelSnapshot',
    'veterinaryMeta',
    'actorUserId',
    'actorEmail',
    'inventoryConsumption:\'not-performed\''
  ]){
    if(!veterinaryRoutes.includes(contract))fail(`veterinaria: missing medication backend contract ${contract}`);
  }
  const medicationRouteStart=veterinaryRoutes.indexOf("router.post('/medications/prescriptions'");
  const medicationRouteEnd=veterinaryRoutes.indexOf("router.get('/clinical-inventory'",medicationRouteStart);
  const medicationRouteBlock=veterinaryRoutes.slice(medicationRouteStart,medicationRouteEnd);
  if(/InventoryMovement|inventoryMovement\.create|stock.*decrement|applyStandardEffect/.test(medicationRouteBlock))fail('veterinaria: 28/51 must not consume inventory before clinical inventory authority');
  for(const contract of ['"productId"','"labelSnapshot"','"veterinaryMeta"','CarePrescription_productId_fkey','CarePrescription_tenant_product_idx']){
    if(!veterinaryMedicationMigration.includes(contract))fail(`veterinaria: missing medication persistence contract ${contract}`);
  }
  if(/CREATE TABLE/i.test(veterinaryMedicationMigration))fail('veterinaria: 28/51 must extend CarePrescription instead of creating a second prescription authority');
  for(const contract of ['prod."tenantId"=p."tenantId"','pr."tenantId"=p."tenantId"']){
    if(!healthExtendedRoutes.includes(contract))fail(`veterinaria: missing tenant-safe prescription read contract ${contract}`);
  }

  const veterinaryClinicalInventory=read('frontend/src/components/veterinary/VeterinaryClinicalInventoryPanel.jsx');
  const clinicalInventoryMigration=read('backend/prisma/migrations/20260922221500_veterinary_clinical_inventory_v2951/migration.sql');
  const inventoryRoutes=read('backend/src/modules/inventory/inventory.routes.ts');
  const inventoryCoreService=read('backend/src/shared/services/inventory-movement.service.ts');
  const prismaSchema=read('backend/prisma/schema.prisma');
  if((veterinaryWorkspace.match(/<VeterinaryClinicalInventoryPanel/g)||[]).length!==1)fail('veterinaria: clinical inventory panel must render exactly once');
  if((veterinaryWorkspace.match(/import \{ VeterinaryClinicalInventoryPanel \}/g)||[]).length!==1)fail('veterinaria: clinical inventory panel must have one owner import');
  if(/querySelector|addEventListener|innerHTML|document\./.test(veterinaryClinicalInventory))fail('veterinaria: clinical inventory reintroduced imperative DOM lifecycle');
  for(const contract of ['Inventario clínico','Lote','Vencimiento','Mínimo','Reorden','Consumo derivado del acto clínico','Prescripción','Cantidad consumida','No hay selección automática de dosis ni de lote']){
    if(!veterinaryClinicalInventory.includes(contract))fail(`veterinaria: missing clinical inventory UI contract ${contract}`);
  }
  for(const contract of ['VeterinaryService.clinicalInventory(','VeterinaryService.createClinicalInventoryLot(','VeterinaryService.clinicalConsumptions(','VeterinaryService.consumeClinicalInventory(']){
    if(!veterinaryClinicalInventory.includes(contract))fail(`veterinaria: missing clinical inventory service wiring ${contract}`);
  }
  if(/calculateDose|recommendDose|autoDose|doseRecommendation|autoSelectLot|recommendedLot/.test(veterinaryClinicalInventory))fail('veterinaria: clinical inventory must not auto-select dose or lot');
  for(const contract of [
    "router.get('/clinical-inventory'",
    "router.post('/clinical-inventory/lots'",
    "router.get('/clinical-inventory/consumptions'",
    "router.post('/clinical-inventory/consume'",
    "requirePermission('inventory.manage')",
    'clinicalInventoryConsumptionSchema',
    'pg_advisory_xact_lock',
    'lockInventoryProduct',
    'lockInventoryLot',
    'inventoryLotBalance',
    "source:'veterinary-prescription'",
    'No se puede consumir un lote vencido.',
    'Existencia insuficiente en el lote seleccionado.'
  ]){
    if(!veterinaryRoutes.includes(contract))fail(`veterinaria: missing clinical inventory backend contract ${contract}`);
  }
  for(const contract of ['model InventoryLot','lots        InventoryLot[]','lotId       String?','InventoryLot?']){
    if(!prismaSchema.includes(contract))fail(`veterinaria: missing canonical lot schema contract ${contract}`);
  }
  for(const contract of ['CREATE TABLE IF NOT EXISTS public."InventoryLot"','InventoryMovement_lotId_fkey','InventoryMovement_vet_clinical_act_unique','ENABLE ROW LEVEL SECURITY','REVOKE ALL']){
    if(!clinicalInventoryMigration.includes(contract))fail(`veterinaria: missing clinical inventory migration contract ${contract}`);
  }
  if(/"stock"\s+numeric/.test(clinicalInventoryMigration))fail('veterinaria: InventoryLot must not duplicate materialized product stock');
  for(const contract of ['lockInventoryProduct','applyInventoryStandardEffect','lockInventoryLot','inventoryLotBalance']){
    if(!inventoryCoreService.includes(contract))fail(`veterinaria: missing shared inventory authority ${contract}`);
  }
  if(/async function lockProduct\(|async function applyStandardEffect\(/.test(inventoryRoutes))fail('inventory: route must not reintroduce duplicated stock-effect helpers');
  for(const contract of ['original.lotId','lockInventoryLot','inventoryLotBalance','INVENTORY_LOT_REVERSAL_INVALID_BALANCE','lotId: original.lotId || null']){
    if(!inventoryRoutes.includes(contract))fail(`inventory: missing lot-aware reversal contract ${contract}`);
  }

  const veterinaryFinancial=read('frontend/src/components/veterinary/VeterinaryFinancialPanel.jsx');
  const veterinaryFinancialMigration=read('backend/prisma/migrations/20260922224500_veterinary_financial_flow_v3051/migration.sql');
  const salesRoutes=read('backend/src/modules/sales/sales.routes.ts');
  if((veterinaryWorkspace.match(/import \{ VeterinaryFinancialPanel \}/g)||[]).length!==1)fail('veterinaria: financial workflow must have one owner import');
  if((veterinaryWorkspace.match(/<VeterinaryFinancialPanel/g)||[]).length!==1)fail('veterinaria: financial workflow must render exactly once');
  if(!veterinaryWorkspace.includes("['finanzas', 'Finanzas'"))fail('veterinaria: financial workflow tab is missing');
  if(/querySelector|addEventListener|innerHTML|document\./.test(veterinaryFinancial))fail('veterinaria: financial workflow reintroduced imperative DOM lifecycle');
  for(const contract of ['Estimación','Autorizar','Atención registrada','Crear factura borrador','Consumos reales','No contabiliza']){
    if(!veterinaryFinancial.includes(contract))fail(`veterinaria: missing financial UI contract ${contract}`);
  }
  for(const contract of ['VeterinaryService.financialCases(','VeterinaryService.financialCatalog(','VeterinaryService.createFinancialCase(','VeterinaryService.authorizeFinancialCase(','VeterinaryService.attendFinancialCase(','VeterinaryService.financialConsumptions(','VeterinaryService.invoiceFinancialCase(']){
    if(!veterinaryFinancial.includes(contract))fail(`veterinaria: missing financial service wiring ${contract}`);
  }
  for(const contract of [
    'veterinaryEstimateLineSchema',
    "router.get('/financial-cases/catalog'",
    "router.get('/financial-cases'",
    "router.post('/financial-cases'",
    "router.post('/financial-cases/:id/authorize'",
    "router.post('/financial-cases/:id/attend'",
    "router.get('/financial-cases/:id/consumptions'",
    "router.post('/financial-cases/:id/invoice'",
    'calculateInvoiceTotals',
    'estimateSha256',
    'VETERINARY_FINANCIAL_CONSENT_KIND',
    "mode:'typed-attestation'",
    'VeterinaryFinancialConsumptionLink',
    "status:'draft'",
    "accountingPosting:'not-performed'"
  ]){
    if(!veterinaryRoutes.includes(contract))fail(`veterinaria: missing financial backend contract ${contract}`);
  }
  if(/ledgerEntry\.create|INSERT INTO public\."LedgerEntry"/.test(veterinaryRoutes))fail('veterinaria: financial workflow must not post accounting entries');
  for(const contract of ['VeterinaryFinancialCase','VeterinaryFinancialConsumptionLink','estimateSha256','authorizationConsentId','salesInvoiceId','ENABLE ROW LEVEL SECURITY','REVOKE ALL']){
    if(!veterinaryFinancialMigration.includes(contract))fail(`veterinaria: missing financial persistence contract ${contract}`);
  }
  if(!salesRoutes.includes('VeterinaryFinancialCase')||!salesRoutes.includes('flujo financiero veterinario'))fail('sales: veterinary provenance-linked drafts must be protected from deletion');

  const guardianPortalPanel=read('frontend/src/components/veterinary/VeterinaryGuardianPortalPanel.jsx');
  const guardianPortalPublic=read('backend/src/modules/verticals/veterinary-guardian-portal.public.routes.ts');
  const guardianPortalMigration=read('backend/prisma/migrations/20260923134500_veterinary_guardian_portal_v3151/migration.sql');
  const guardianPortalEntry=read('frontend/src/guardianPortal.jsx');
  const viteConfig=read('frontend/vite.config.js');
  if((veterinaryWorkspace.match(/import \{ VeterinaryGuardianPortalPanel \}/g)||[]).length!==1)fail('veterinaria: guardian portal admin must have one owner import');
  if((veterinaryWorkspace.match(/<VeterinaryGuardianPortalPanel/g)||[]).length!==1)fail('veterinaria: guardian portal admin must render exactly once');
  if(!veterinaryWorkspace.includes("['tutor', 'Portal tutor'"))fail('veterinaria: guardian portal tab is missing');
  for(const contract of ['guardianPortalGrants','createGuardianPortalGrant','revokeGuardianPortalGrant','createCommunication']){
    if(!guardianPortalPanel.includes(contract))fail(`veterinaria: missing guardian portal admin contract ${contract}`);
  }
  for(const contract of ['tokenSha256','VeterinaryGuardianPortalGrant','ENABLE ROW LEVEL SECURITY','REVOKE ALL']){
    if(!guardianPortalMigration.includes(contract))fail(`veterinaria: missing guardian portal persistence contract ${contract}`);
  }
  if(/"token"\s+text/i.test(guardianPortalMigration))fail('veterinaria: guardian portal must never persist plaintext tokens');
  for(const contract of ["router.post('/session'",'createHash(\'sha256\')','appointments','discharges','documents','billing','communications']){
    if(!guardianPortalPublic.includes(contract))fail(`veterinaria: missing public portal allow-list contract ${contract}`);
  }
  if(/router\.(get|put|patch|delete)\(/.test(guardianPortalPublic))fail('veterinaria: public guardian portal boundary must expose only the token-session POST');
  if((guardianPortalPublic.match(/UPDATE public\."VeterinaryGuardianPortalGrant"/g)||[]).length!==1||!guardianPortalPublic.includes('"lastUsedAt"=now()'))fail('veterinaria: public portal may mutate only grant lastUsedAt');
  for(const forbidden of ['attachmentPath','clinicalData','"diagnosis"','"findings"','"impression"','"payload"','providerMessageId']){
    if(guardianPortalPublic.includes(forbidden))fail(`veterinaria: public guardian portal exposed forbidden field ${forbidden}`);
  }
  if(!veterinaryRoutes.includes('randomBytes(32)')||!veterinaryRoutes.includes('expiresInHours')||!veterinaryRoutes.includes('max(168)'))fail('veterinaria: guardian grants must use 256-bit tokens with <=7 day TTL');
  if(veterinaryRoutes.includes('?token='))fail('veterinaria: guardian token must never be placed in query parameters');
  if(!veterinaryRoutes.includes('#access='))fail('veterinaria: guardian portal link must keep token in URL fragment');
  if(!guardianPortalPanel.includes('expiresInHours')||!guardianPortalPanel.includes('scopes'))fail('veterinaria: guardian admin must expose TTL and explicit scopes');
  if(!viteConfig.includes('portal-veterinaria'))fail('veterinaria: guardian portal Vite entry is missing');
  if(!guardianPortalEntry.includes('noAuth:true')||!guardianPortalEntry.includes("sessionStorage.setItem('cg_veterinary_portal_access'")||!guardianPortalEntry.includes("replace(/^#/"))fail('veterinaria: portal frontend must consume fragment token without ERP auth');
  if(guardianPortalEntry.includes('location.search')||guardianPortalEntry.includes("get('token')"))fail('veterinaria: portal frontend must not read secret from query string');
  for(const forbidden of ['x.diagnosis','x.impression','guardianText']){
    if(guardianPortalEntry.includes(forbidden))fail(`veterinaria: portal UI reintroduced sensitive field ${forbidden}`);
  }

  const veterinaryBoarding=read('frontend/src/components/veterinary/VeterinaryBoardingPanel.jsx');
  const veterinaryBoardingMigration=read('backend/prisma/migrations/20260923141000_veterinary_boarding_resources_v3251/migration.sql');
  if((veterinaryWorkspace.match(/import \{ VeterinaryBoardingPanel \}/g)||[]).length!==1)fail('veterinaria: boarding panel must have one owner import');
  if((veterinaryWorkspace.match(/<VeterinaryBoardingPanel/g)||[]).length!==1)fail('veterinaria: boarding panel must render exactly once');
  if(!veterinaryWorkspace.includes("['boarding', 'Estancia'"))fail('veterinaria: boarding tab is missing');
  if(/querySelector|addEventListener|innerHTML|document\./.test(veterinaryBoarding))fail('veterinaria: boarding reintroduced imperative DOM lifecycle');
  for(const contract of ['Boarding / estancia opcional','Activar módulo opcional','Ventana de disponibilidad','Nuevo recurso','Reservar estancia','Registrar ingreso','Finalizar estancia','No sustituye Hospitalización']){
    if(!veterinaryBoarding.includes(contract))fail(`veterinaria: missing boarding UI contract ${contract}`);
  }
  for(const contract of ["router.get('/boarding/settings'","router.patch('/boarding/settings', requirePermission('admin.manage')","router.get('/boarding/resources'","router.post('/boarding/resources'","router.patch('/boarding/resources/:id/status'","router.get('/boarding/stays'","router.post('/boarding/stays'","router.patch('/boarding/stays/:id/status'",'pg_advisory_xact_lock','veterinary-boarding-resource','veterinary-boarding-patient','estancia solapada']){
    if(!veterinaryRoutes.includes(contract))fail(`veterinaria: missing boarding backend contract ${contract}`);
  }
  for(const contract of ['VeterinaryBoardingSetting','VeterinaryBoardingResource','VeterinaryBoardingStay','ENABLE ROW LEVEL SECURITY','REVOKE ALL']){
    if(!veterinaryBoardingMigration.includes(contract))fail(`veterinaria: missing boarding persistence contract ${contract}`);
  }
  if(/ALTER TABLE public\."CareHospitalization"/.test(veterinaryBoardingMigration))fail('veterinaria: boarding must not rewrite hospitalization authority');
  if(/autoAssign|recommendedResource|recommendResource|autoSelect/.test(veterinaryBoarding))fail('veterinaria: boarding must not auto-assign resources');

  for(const [surfaceName,surface] of [
    ['financial',veterinaryFinancial],
    ['guardian portal',guardianPortalPanel],
    ['boarding',veterinaryBoarding]
  ]){
    if(!surface.includes('reportVeterinaryError'))fail(`veterinaria: ${surfaceName} surface must use safe error reporting`);
    if(/\.catch\(\s*\(?.*?\)?\s*=>\s*null\s*\)|catch\s*\{\s*\}/s.test(surface))fail(`veterinaria: ${surfaceName} surface reintroduced silent catch swallowing`);
    if(!surface.includes('Reintentar'))fail(`veterinaria: ${surfaceName} surface must expose retry for failed reads`);
  }
  for(const contract of [
    "reportVeterinaryError('guardianPortal.copyLink'",
    "reportVeterinaryError('guardianPortal.communicationLog'",
    'setError(message)',
    'toast.error(message)'
  ]){
    if(!guardianPortalPanel.includes(contract))fail(`veterinaria: guardian portal missing visible error contract ${contract}`);
  }

}

const dentistryEntry=ERP_UI_WAVE_A_2_51.find((item)=>item.route==='odontologia');
const dentistry=sourceCache.get(dentistryEntry?.renderer);
if(dentistryEntry?.status==='MIGRATED'){
  if(/components\/ui\/index\.js|mountSubmit|escapeHtml|innerHTML|querySelector|addEventListener/.test(dentistry))fail('odontologia: migrated route reintroduced imperative dentistry lifecycle or legacy kit');
  if((dentistry.match(/createRoot\(/g)||[]).length!==1)fail('odontologia: migrated route must own exactly one React root');
  for(const primitive of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgEmptyState']){
    if(!dentistry.includes(primitive))fail(`odontologia: missing canonical primitive ${primitive}`);
  }
  if(/rows\(initial\.patients\)\[0\]|nextPatients\[0\]|patients\[0\]/.test(dentistry))fail('odontologia: clinical context must never fall back to the first patient');
  for(const contract of ['selectedPatientId','patientId:selectedPatientId',"setSelectedTooth('')"]){
    if(!dentistry.includes(contract))fail(`odontologia: missing explicit selected-patient contract ${contract}`);
  }
  for(const contract of ['PERMANENT_TEETH','PRIMARY_TEETH','selectedSurfaces','odontogram:{dentition','surfaces:selectedSurfaces','condition:encounterForm.condition.trim()']){
    if(!dentistry.includes(contract))fail(`odontologia: missing structured odontogram contract ${contract}`);
  }
  const toothSurfaceSelector=read('frontend/src/components/dentistry/ToothSurfaceSelector.jsx');
  if(!dentistry.includes('ToothSurfaceSelector'))fail('odontologia: visual tooth surface selector is not composed');
  if(/querySelector|addEventListener|innerHTML|document\./.test(toothSurfaceSelector))fail('odontologia: visual tooth surface selector reintroduced imperative DOM lifecycle');
  for(const contract of ['SURFACE_LAYOUT','gridTemplateAreas','aria-pressed','selectedSurfaces','onChange','vestibular','lingual_palatal','mesial','distal','occlusal_incisal']){
    if(!toothSurfaceSelector.includes(contract))fail(`odontologia: missing visual surface contract ${contract}`);
  }
  if(!/minWidth:\s*44/.test(toothSurfaceSelector)||!/minHeight:\s*44/.test(toothSurfaceSelector))fail('odontologia: tooth surface targets must remain at least 44px');
  for(const contract of ['amendmentTarget','amendmentReason','prepareAmendment','HealthVerticalService.amendEncounter(','versioning?.revision','versioning?.reason','versioning?.actor','versioning?.changedFields','versioning?.before','versioning?.after']){
    if(!dentistry.includes(contract))fail(`odontologia: missing versioned history contract ${contract}`);
  }
  const lifecycleActions=read('frontend/src/components/dentistry/DentalLifecycleActions.jsx');
  const healthRoutes=read('backend/src/modules/verticals/health.routes.ts');
  const lifecycleMigration=read('backend/prisma/migrations/20260921122000_dental_encounter_lifecycle_v1851/migration.sql');
  if(!dentistry.includes('DentalLifecycleActions'))fail('odontologia: clinical lifecycle actions are not composed');
  if((dentistry.match(/<DentalLifecycleActions/g)||[]).length!==1)fail('odontologia: clinical lifecycle actions must render from one owner');
  if(/querySelector|addEventListener|innerHTML|document\./.test(lifecycleActions))fail('odontologia: clinical lifecycle actions reintroduced imperative DOM lifecycle');
  for(const contract of ['Enviar a revisión','Firmar versión','Borrador','En revisión','Firmado','Enmendado','CgDialog']){
    if(!lifecycleActions.includes(contract))fail(`odontologia: missing clinical lifecycle UI contract ${contract}`);
  }
  for(const contract of ["router.post('/health/encounters/:id/workflow'","submit-review","previous.status!=='draft'","previous.status!=='review'","reviewRequestedAt","reviewRequestedBy","signedBy"]){
    if(!healthRoutes.includes(contract))fail(`odontologia: missing clinical lifecycle backend contract ${contract}`);
  }
  if(!dentistry.includes('HealthVerticalService.transitionDentalEncounter('))fail('odontologia: lifecycle must use canonical transition service');
  const treatmentSubmit=dentistry.slice(dentistry.indexOf('async function submitEncounter'),dentistry.indexOf('async function createTreatmentPlan'));
  if(!treatmentSubmit.includes("status:'draft'")||treatmentSubmit.includes("status:'signed'"))fail('odontologia: new dental treatment must remain draft until explicit review/sign');
  if(!lifecycleMigration.includes("'review'"))fail('odontologia: CareEncounter lifecycle migration must preserve review state');

  const dentalSchedule=read('frontend/src/components/dentistry/DentalSchedulePanel.jsx');
  const scheduleService19=read('frontend/src/services/verticalService.js');
  const scheduleMigration19=read('backend/prisma/migrations/20260921135000_dental_advanced_scheduling_v1951/migration.sql');
  if(!dentistry.includes('DentalSchedulePanel'))fail('odontologia: advanced schedule panel is not composed');
  if((dentistry.match(/<DentalSchedulePanel/g)||[]).length!==1)fail('odontologia: advanced schedule must render from one owner');
  if(/submitAppointment|appointmentForm|appointmentIso/.test(dentistry))fail('odontologia: legacy appointment form wiring still exists');
  if(/querySelector|addEventListener|innerHTML|document\./.test(dentalSchedule))fail('odontologia: advanced schedule reintroduced imperative DOM lifecycle');
  for(const contract of ['Agenda odontológica avanzada','Sillón / recurso','Duración','Agregar a lista de espera','Intentar programar','Confirmar','Guardar recall']){
    if(!dentalSchedule.includes(contract))fail(`odontologia: missing advanced schedule UI contract ${contract}`);
  }
  for(const contract of ['appointmentStatusSchema','lockAppointmentSchedule','pg_advisory_xact_lock','assertAppointmentSlotAvailable',"router.patch('/health/appointments/:id'",'recallDueAt','schedulingMeta']){
    if(!healthRoutes.includes(contract))fail(`odontologia: missing advanced schedule backend contract ${contract}`);
  }
  if(!scheduleService19.includes('updateAppointment(id, payload)')||!scheduleService19.includes("method:'PATCH'"))fail('odontologia: advanced schedule must use canonical appointment PATCH service');
  for(const contract of ["'waitlisted'",'"recallDueAt"','"schedulingMeta"','CareAppointment_tenant_professional_slot_idx','CareAppointment_tenant_room_slot_idx']){
    if(!scheduleMigration19.includes(contract))fail(`odontologia: missing advanced schedule migration contract ${contract}`);
  }

  const periodontal=read('frontend/src/components/dentistry/PeriodontalChartPanel.jsx');
  if(!dentistry.includes('PeriodontalChartPanel'))fail('odontologia: structured periodontogram panel is not composed');
  if(/querySelector|addEventListener|innerHTML|document\./.test(periodontal))fail('odontologia: periodontogram reintroduced imperative DOM lifecycle');
  for(const contract of ['PERIODONTAL_SITES','probingDepthMm','gingivalMarginMm','bleeding','suppuration','plaque','mobilityGrade','furcationGrade','previousSameTooth','maxProbingDepth','maxAttachmentLevel','Evolución periodontal']){
    if(!periodontal.includes(contract))fail(`odontologia: missing periodontogram contract ${contract}`);
  }
  if(!dentistry.includes("type:'periodontal-chart'")||!dentistry.includes('clinicalData:{periodontogram:'))fail('odontologia: periodontogram must persist through canonical CareEncounter payload');
  const treatmentPlan=read('frontend/src/components/dentistry/TreatmentPlanPanel.jsx');
  if(!dentistry.includes('TreatmentPlanPanel'))fail('odontologia: treatment plan panel is not composed');
  if((dentistry.match(/<TreatmentPlanPanel/g)||[]).length!==1)fail('odontologia: treatment plan panel must be composed exactly once');
  if((dentistry.match(/async function createTreatmentPlan\(/g)||[]).length!==1)fail('odontologia: treatment plan create handler must have one owner');
  if((dentistry.match(/async function decideTreatmentPlan\(/g)||[]).length!==1)fail('odontologia: treatment plan decision handler must have one owner');
  if(/querySelector|addEventListener|innerHTML|document\./.test(treatmentPlan))fail('odontologia: treatment plan reintroduced imperative DOM lifecycle');
  for(const contract of ['alternatives','phases','procedures','Presupuesto estimado','Aceptar plan','Rechazar plan']){
    if(!treatmentPlan.includes(contract))fail(`odontologia: missing treatment-plan contract ${contract}`);
  }
  if(!dentistry.includes("type:'dental-treatment-plan'")||!dentistry.includes("status:'proposed'")||!dentistry.includes("acceptance:{status:'pending'}"))fail('odontologia: treatment plan must start proposed/pending in canonical CareEncounter');
  if(!dentistry.includes('HealthVerticalService.decideTreatmentPlan('))fail('odontologia: treatment-plan decision must use canonical backend authority');
  if(countNamedImport(dentistry,'TreatmentPlanPanel')!==1)fail('odontologia: TreatmentPlanPanel must have exactly one named import');
  if((dentistry.match(/async function createTreatmentPlan\(/g)||[]).length!==1)fail('odontologia: createTreatmentPlan must remain singleton');
  if((dentistry.match(/async function decideTreatmentPlan\(/g)||[]).length!==1)fail('odontologia: decideTreatmentPlan must remain singleton');
  if((dentistry.match(/<TreatmentPlanPanel/g)||[]).length!==1)fail('odontologia: treatment plan panel must render exactly once');
  const verticalService=read('frontend/src/services/verticalService.js');
  if(!dentistry.includes('DentalLifecycleActions'))fail('odontologia: clinical lifecycle actions are not composed');
  if(/querySelector|addEventListener|innerHTML|document\./.test(lifecycleActions))fail('odontologia: clinical lifecycle actions reintroduced imperative DOM lifecycle');
  for(const contract of ['Enviar a revisión','Firmar versión','En revisión','Borrador','Firmado','Enmendado','CgDialog']){
    if(!lifecycleActions.includes(contract))fail(`odontologia: missing clinical lifecycle UI contract ${contract}`);
  }
  for(const contract of ['transitionDentalEncounter','/workflow']){
    if(!verticalService.includes(contract))fail(`odontologia: missing lifecycle service contract ${contract}`);
  }
  for(const contract of ['dentalEncounterWorkflowSchema','normalizeDentalTreatmentDraft',"'submit-review'","'review'","reviewRequestedAt","reviewRequestedBy","signedBy","previousEncounterId"]){
    if(!healthRoutes.includes(contract))fail(`odontologia: missing lifecycle backend contract ${contract}`);
  }
  if(!lifecycleMigration.includes("'review'"))fail('odontologia: CareEncounter DB status constraint must admit review');
  if(!dentistry.includes("status:'draft'"))fail('odontologia: new dental treatment must be submitted as draft');
  if((dentistry.match(/HealthVerticalService\.transitionDentalEncounter\(/g)||[]).length!==1)fail('odontologia: lifecycle transition must have a single page owner');

  const consentPanel=read('frontend/src/components/dentistry/DentalConsentPanel.jsx');
  if(!dentistry.includes('DentalConsentPanel'))fail('odontologia: dental consent evidence panel is not composed');
  if(/querySelector|addEventListener|innerHTML|document\./.test(consentPanel))fail('odontologia: dental consent panel reintroduced imperative DOM lifecycle');
  for(const contract of ['Firma declarativa','No es un certificado criptográfico','attestation','Nombre del firmante','Texto del consentimiento','Revocar consentimiento','SHA-256','Revisión']){
    if(!consentPanel.includes(contract))fail(`odontologia: missing consent evidence contract ${contract}`);
  }
  for(const contract of ['HealthVerticalService.consents(','HealthVerticalService.signDentalConsent(','HealthVerticalService.revokeConsent(']){
    if(!dentistry.includes(contract))fail(`odontologia: missing consent service wiring ${contract}`);
  }
  if(countNamedImport(dentistry,'DentalConsentPanel')!==1)fail('odontologia: DentalConsentPanel must have exactly one named import');
  if((dentistry.match(/<DentalConsentPanel/g)||[]).length!==1)fail('odontologia: dental consent panel must render exactly once');

  const dentalMedia=read('frontend/src/components/dentistry/DentalMediaPanel.jsx');
  const mediaService=read('frontend/src/services/mediaService.js');
  const backendApi=read('frontend/src/services/backendApi.js');
  const mediaRoutes=read('backend/src/modules/media/media.routes.ts');
  const mediaMigration=read('backend/prisma/migrations/20260918222000_dental_clinical_media_v1751/migration.sql');
  if(!dentistry.includes('DentalMediaPanel'))fail('odontologia: clinical media panel is not composed');
  if((dentistry.match(/<DentalMediaPanel/g)||[]).length!==1)fail('odontologia: clinical media panel must render exactly once');
  if(/querySelector|addEventListener|innerHTML|document\./.test(dentalMedia))fail('odontologia: clinical media panel reintroduced imperative DOM lifecycle');
  for(const contract of ['Radiografía','Foto clínica','Estudio / informe','Documento','Pieza','Encuentro relacionado','Plan relacionado','SHA-256','Abrir archivo']){
    if(!dentalMedia.includes(contract))fail(`odontologia: missing clinical media UI contract ${contract}`);
  }
  for(const contract of ['MediaService.dentalAttachments(','MediaService.uploadDentalAttachment(']){
    if(!dentistry.includes(contract))fail(`odontologia: missing clinical media service wiring ${contract}`);
  }
  if(!mediaService.includes('x-clinical-metadata')||!mediaRoutes.includes('x-clinical-metadata'))fail('odontologia: clinical media metadata must stay out of upload URLs');
  if(/uploadDentalAttachment[\s\S]{0,1800}BackendApi\.request\(`\/media\/dental-attachments\?/.test(mediaService)||/clinicalAttachmentSchema\.parse\(req\.query/.test(mediaRoutes))fail('odontologia: clinical attachment metadata leaked into upload URL/query');
  for(const contract of ['uploadDentalAttachment','dentalAttachments','application/pdf','15 * 1024 * 1024']){
    if(!mediaService.includes(contract))fail(`odontologia: missing clinical media service contract ${contract}`);
  }
  for(const contract of ['isBinaryBody','Blob','ArrayBuffer','ArrayBuffer.isView']){
    if(!backendApi.includes(contract))fail(`odontologia: BackendApi missing binary body contract ${contract}`);
  }
  for(const contract of ['CLINICAL_MAX_BYTES','express.raw','validateClinicalMagic','dental-attachments',"type:'dental-attachment'",'health.manage','sha256','storagePath']){
    if(!mediaRoutes.includes(contract))fail(`odontologia: missing clinical media backend contract ${contract}`);
  }
  if(!mediaMigration.includes('contagest-clinical-media')||!mediaMigration.includes('15728640')||!mediaMigration.includes('application/pdf')||!/public\s*=\s*false/.test(mediaMigration))fail('odontologia: clinical media bucket must remain isolated/private with 15 MB/PDF support');
  if(/UPDATE storage\.buckets[\s\S]{0,300}WHERE id = 'contagest-media'/.test(mediaMigration))fail('odontologia: clinical media migration must not widen generic contagest-media limits');
  if(!mediaRoutes.includes("DENTAL_BUCKET = 'contagest-clinical-media'"))fail('odontologia: dental media route must use isolated clinical bucket');

  const dentalFinancial=read('frontend/src/components/dentistry/DentalFinancialPanel.jsx');
  const dentalFinancialMigration=read('backend/prisma/migrations/20260921141000_dental_erp_financial_v2051/migration.sql');
  const dentalFinancialService=read('frontend/src/services/verticalService.js');
  const salesRoutes20=read('backend/src/modules/sales/sales.routes.ts');
  if(!dentistry.includes('DentalFinancialPanel'))fail('odontologia: ERP financial panel is not composed');
  if((dentistry.match(/<DentalFinancialPanel/g)||[]).length!==1)fail('odontologia: ERP financial panel must render from one owner');
  if(/querySelector|addEventListener|innerHTML|document\./.test(dentalFinancial))fail('odontologia: ERP financial panel reintroduced imperative DOM lifecycle');
  for(const contract of ['Presupuesto, cobranza y analítica ERP','SalesInvoice','Crear borrador ERP','Producción por profesional','Producción por procedimiento','Cobrado']){
    if(!dentalFinancial.includes(contract))fail(`odontologia: missing ERP financial UI contract ${contract}`);
  }
  for(const contract of ['dentalFinancial(params = {})','createDentalFinancialLink(id)']){
    if(!dentalFinancialService.includes(contract))fail(`odontologia: missing ERP financial service contract ${contract}`);
  }
  for(const contract of [
    "router.get('/health/dental/financial'",
    "router.post('/health/encounters/:id/financial-link'",
    "requirePermission('sales.view')",
    "requirePermission('sales.manage')",
    'pg_advisory_xact_lock',
    'acceptedDentalTreatmentPlanClinicalDataSchema',
    'calculateInvoiceTotals',
    "taxRate:'0'",
    "status:'draft'",
    'dental.financial.link.created',
    'fiscalReviewRequired:true'
  ]){
    if(!healthRoutes.includes(contract))fail(`odontologia: missing ERP financial backend contract ${contract}`);
  }
  const financialStart=healthRoutes.indexOf("router.get('/health/dental/financial'");
  const financialEnd=healthRoutes.indexOf("router.post('/health/measurements'",financialStart);
  const financialBlock=healthRoutes.slice(financialStart,financialEnd);
  if(financialStart<0||financialEnd<0)fail('odontologia: ERP financial route boundaries missing');
  if(/ledgerEntry|salesInvoiceLinesForLedger|assertBalanced|postedAt|postedBy/.test(financialBlock))fail('odontologia: Health must never post accounting entries from dental financial integration');
  for(const contract of [
    'CREATE TABLE IF NOT EXISTS public."DentalFinancialLink"',
    '"treatmentPlanId"',
    '"salesInvoiceId"',
    '"budgetSnapshot"',
    'DentalFinancialLink_tenant_plan_unique',
    'DentalFinancialLink_tenant_sale_unique',
    'ENABLE ROW LEVEL SECURITY',
    'REVOKE ALL'
  ]){
    if(!dentalFinancialMigration.includes(contract))fail(`odontologia: missing ERP financial persistence contract ${contract}`);
  }
  if(!salesRoutes20.includes('DentalFinancialLink')||!salesRoutes20.includes('provenance financiera'))fail('odontologia: Sales draft deletion must protect dental financial provenance');

}

const fitnessEntries=ERP_UI_WAVE_A_2_51.filter((item)=>['gimnasio','rutinas','nutricion'].includes(item.route));
const fitness=sourceCache.get('frontend/src/pages/GymManagementPage.jsx');
if(fitnessEntries.every((item)=>item.status==='MIGRATED')){
  if(/components\/ui\/index\.js|escapeHtml|innerHTML|querySelector|addEventListener|mountSubmit|MutationObserver/.test(fitness))fail('fitness: migrated renderer reintroduced imperative fitness lifecycle or legacy kit');
  if((fitness.match(/createRoot\(/g)||[]).length!==1)fail('fitness: migrated renderer must own exactly one React root');
  for(const primitive of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgEmptyState']){
    if(!fitness.includes(primitive))fail(`fitness: missing canonical primitive ${primitive}`);
  }
  const productivityPath='frontend/src/components/fitness/FitnessProductivityTools.jsx';
  const productivity=read(productivityPath);
  if(/MutationObserver|innerHTML|querySelector|addEventListener|document\.createElement/.test(productivity))fail('fitness: productivity tools reintroduced imperative DOM mutation');
  if(fs.existsSync(path.join(root,'frontend/src/services/fitnessProductivityEnhancer.js')))fail('fitness: superseded MutationObserver enhancer still exists');
  const routineBuilder=read('frontend/src/components/fitness/RoutineBuilder.jsx');
  if(!fitness.includes('RoutineBuilder'))fail('fitness: structured routine builder is not composed');
  if((fitness.match(/<RoutineBuilder/g)||[]).length!==1)fail('fitness: routine builder must render from one owner');
  if(/exerciseLines|Ejercicios: Día \| Ejercicio \| Grupo \| Series \| Reps \| Descanso/.test(fitness))fail('fitness: free-text routine parser/editor reintroduced');
  if(/querySelector|addEventListener|innerHTML|document\./.test(routineBuilder))fail('fitness: routine builder reintroduced imperative DOM lifecycle');
  for(const contract of ['addExercise','removeExercise','updateExercise','moveExercise','duplicateExercise','exerciseName','muscleGroup','equipment','sets','reps','loadKg','restSeconds','tempo','notes','FITNESS_EXERCISES']){
    if(!routineBuilder.includes(contract))fail(`fitness: missing routine-builder contract ${contract}`);
  }
  const routineSubmit=fitness.slice(fitness.indexOf('const submitRoutine'),fitness.indexOf('const submitNutrition'));
  if(/exerciseLines|split\('\\n'\)|split\('\|'\)/.test(routineSubmit))fail('fitness: structured routine submit reintroduced free-text parsing');
  if(!routineSubmit.includes('const exercises=routineForm.exercises.map')||!routineSubmit.includes('GymVerticalService.createRoutine('))fail('fitness: routine builder must sanitize and persist through canonical GymVerticalService');
  const gymRoutes=read('backend/src/modules/verticals/gym.routes.ts');
  const routineRoute=gymRoutes.slice(gymRoutes.indexOf("router.post('/gym/routines'"),gymRoutes.indexOf("router.get('/gym/nutrition'"));
  for(const contract of ['prisma.$transaction','GymMember','GymTrainer','GymExercise','GymRoutineExercise','El cliente no pertenece al tenant activo.','El instructor no pertenece al tenant activo.','El ejercicio seleccionado no pertenece al tenant activo.']){
    if(!routineRoute.includes(contract))fail(`fitness: missing atomic/tenant-safe routine contract ${contract}`);
  }
  const exerciseLibrary=read('frontend/src/components/fitness/ExerciseLibraryPanel.jsx');
  if((fitness.match(/<ExerciseLibraryPanel/g)||[]).length!==1)fail('fitness: exercise library must render from one owner');
  if(/querySelector|addEventListener|innerHTML|document\./.test(exerciseLibrary))fail('fitness: exercise library reintroduced imperative DOM lifecycle');
  for(const contract of ['Buscar ejercicios','Grupo muscular','Equipo','Categoría','Nuevo ejercicio','Editar','Archivar','Reactivar','GymVerticalService.exercises(','GymVerticalService.createExercise(','GymVerticalService.updateExercise(']){
    if(!exerciseLibrary.includes(contract))fail(`fitness: missing exercise-library contract ${contract}`);
  }
  if(!fitness.includes('exerciseLibrary')||!fitness.includes('catalog={exerciseLibrary}'))fail('fitness: persisted exercise library is not passed to RoutineBuilder');
  for(const contract of ["router.get('/gym/exercises'","router.post('/gym/exercises'","router.patch('/gym/exercises/:id'",'exerciseLibrarySchema','public."GymExercise"','"tenantId"=$1']){
    if(!gymRoutes.includes(contract))fail(`fitness: missing exercise-library backend contract ${contract}`);
  }
  for(const contract of ['persistedCatalog','exerciseId:selected.id','defaultSets','defaultReps']){
    if(!routineBuilder.includes(contract))fail(`fitness: routine builder missing persisted-catalog contract ${contract}`);
  }
  if(!exerciseLibrary.includes('syncCanonical')||!exerciseLibrary.includes("GymVerticalService.exercises({active:'true'})"))fail('fitness: filtered exercise-library view must not replace canonical active routine catalog');
  if(/function commit\(next\)[\s\S]{0,220}onItemsChange/.test(exerciseLibrary))fail('fitness: filtered exercise-library view leaked into canonical routine catalog');
  if(!gymRoutes.includes('ON CONFLICT ("tenantId","name") DO NOTHING'))fail('fitness: exercise creation must close duplicate-name race');
  if(/router\.delete\('\/gym\/exercises/.test(gymRoutes))fail('fitness: exercise lifecycle must archive/reactivate instead of deleting history');
  const weeklySchedule=read('frontend/src/components/fitness/WeeklyRoutineSchedule.jsx');
  const weekDays=read('frontend/src/data/fitnessWeekDays.js');
  if((fitness.match(/<WeeklyRoutineSchedule/g)||[]).length!==1)fail('fitness: weekly schedule must render from one owner');
  for(const contract of ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']){
    if(!weekDays.includes(contract))fail(`fitness: missing canonical weekday ${contract}`);
  }
  if(!routineBuilder.includes('FITNESS_WEEK_DAYS'))fail('fitness: RoutineBuilder must use canonical weekdays');
  if(/label="Días\/semana"/.test(fitness))fail('fitness: manual daysPerWeek input reintroduced');
  if(!fitness.includes('scheduledDays')||!fitness.includes('daysPerWeek:scheduledDays.length'))fail('fitness: daysPerWeek must derive from programmed weekdays');
  if(/querySelector|addEventListener|innerHTML|document\./.test(weeklySchedule))fail('fitness: weekly schedule reintroduced imperative DOM lifecycle');
  for(const contract of ['routineSchema.superRefine','scheduledDays','value.daysPerWeek!==scheduledDays.size','La frecuencia semanal debe coincidir con los días programados.']){
    if(!gymRoutes.includes(contract))fail(`fitness: missing weekly schedule backend contract ${contract}`);
  }
  const trainingModes=read('frontend/src/data/fitnessTrainingModes.js');
  const trainingModeMigration=read('backend/prisma/migrations/20260923161500_gym_training_mode_36_51/migration.sql');
  for(const contract of ['strength','hypertrophy','pump','endurance','power','conditioning','mobility']){
    if(!trainingModes.includes(contract))fail(`fitness: missing training mode ${contract}`);
  }
  if(!fitness.includes('FITNESS_TRAINING_MODES')||!fitness.includes('label="Modo de entrenamiento"')||!fitness.includes('trainingMode:routineForm.trainingMode')||!fitness.includes('fitnessTrainingModeLabel(item.trainingMode)'))fail('fitness: explicit training mode is not wired end-to-end in routine UI');
  if(!gymRoutes.includes("trainingMode: z.enum(['strength','hypertrophy','pump','endurance','power','conditioning','mobility'])"))fail('fitness: backend must require an explicit training mode for new routines');
  if(!trainingModeMigration.includes("DEFAULT 'unspecified'")||!trainingModeMigration.includes('GymRoutine_trainingMode_check'))fail('fitness: legacy training-mode migration contract missing');
  if(/applyMode.*(?:sets|reps|loadKg)/s.test(fitness))fail('fitness: training mode must not silently rewrite exercise prescription');
  const intensityTechniques=read('frontend/src/data/fitnessIntensityTechniques.js');
  const intensityMigration=read('backend/prisma/migrations/20260923163000_gym_intensity_techniques_37_51/migration.sql');
  for(const contract of ['standard','drop_set','rest_pause','myo_reps','cluster','superset','giant_set','mechanical_drop','isometric_hold']){
    if(!intensityTechniques.includes(contract))fail(`fitness: missing structured intensity technique ${contract}`);
  }
  for(const contract of ['FITNESS_INTENSITY_TECHNIQUES','intensityTechnique','techniqueConfig','Técnica de intensidad','Rondas','Descanso intra-técnica','Reducción de carga','Clave de grupo','Notas de técnica']){
    if(!routineBuilder.includes(contract))fail(`fitness: RoutineBuilder missing intensity-technique contract ${contract}`);
  }
  for(const contract of ['intensityTechniqueSchema','techniqueConfigSchema','La técnica drop set requiere un porcentaje de reducción de carga.','requiere una clave de grupo.','"intensityTechnique","techniqueConfig"','JSON.stringify(item.techniqueConfig']){
    if(!gymRoutes.includes(contract))fail(`fitness: backend missing intensity-technique contract ${contract}`);
  }
  if(!intensityMigration.includes('GymRoutineExercise_intensityTechnique_check')||!intensityMigration.includes('"techniqueConfig" jsonb'))fail('fitness: intensity-technique migration contract missing');
  if(!fitness.includes('intensityTechnique:String(exercise.intensityTechnique')||!fitness.includes('techniqueConfig:exercise.intensityTechnique'))fail('fitness: structured intensity technique is not sanitized before persistence');
  for(const contract of ['Un superset requiere exactamente 2 ejercicios con la misma clave y día.','Un giant set requiere al menos 3 ejercicios con la misma clave y día.','no puede mezclar superset y giant set el mismo día']){
    if(!gymRoutes.includes(contract))fail(`fitness: grouped intensity technique invariant missing ${contract}`);
  }
  if(/trainingMode[\s\S]{0,300}intensityTechnique\s*:/.test(fitness)||/trainingMode/.test(routineBuilder))fail('fitness: training mode must not auto-select intensity techniques');
  const progressionStrategies=read('frontend/src/data/fitnessProgressionStrategies.js');
  const progressionDomain=read('backend/src/modules/verticals/gym.progression.ts');
  const progressionMigration=read('backend/prisma/migrations/20260923170000_gym_progression_engine_38_51/migration.sql');
  for(const contract of ['manual','linear_load','double_progression','percent_1rm']){
    if(!progressionStrategies.includes(contract))fail(`fitness: missing progression strategy ${contract}`);
  }
  for(const contract of ['FITNESS_PROGRESSION_STRATEGIES','progressionStrategy','progressionConfig','Estrategia de progresión','RIR objetivo','RPE objetivo','1RM de referencia','Estancamiento tras']){
    if(!routineBuilder.includes(contract))fail(`fitness: RoutineBuilder missing progression contract ${contract}`);
  }
  for(const contract of ['progressionStrategySchema','progressionConfigSchema','RPE y RIR no son coherentes','La doble progresión requiere un rango de repeticiones válido.','La progresión por %1RM requiere 1RM y porcentaje.','/gym/progression/evaluate','evaluateGymProgression']){
    if(!gymRoutes.includes(contract))fail(`fitness: backend missing progression engine contract ${contract}`);
  }
  for(const contract of ['increase_load','increase_reps','target_percent_1rm','reset_load','missing_effort_evidence','stall_threshold_reached','applied:false']){
    if(!progressionDomain.includes(contract))fail(`fitness: progression domain missing deterministic contract ${contract}`);
  }
  if(!progressionMigration.includes('GymRoutineExercise_progressionStrategy_check')||!progressionMigration.includes('"progressionConfig" jsonb'))fail('fitness: progression migration contract missing');
  if(!fitness.includes('progressionStrategy:String(exercise.progressionStrategy')||!fitness.includes('progressionConfig:exercise.progressionStrategy'))fail('fitness: progression configuration is not sanitized before persistence');
  if(/mesocycle|periodization|GymWorkoutSession|GymWorkoutSet/.test(progressionDomain))fail('fitness: 38/51 progression engine must not pre-implement periodization or session execution');
  const periodizationPanel=read('frontend/src/components/fitness/PeriodizationPanel.jsx');
  const periodizationBuilder=read('frontend/src/components/fitness/PeriodizationBuilder.jsx');
  const periodizationMigration=read('backend/prisma/migrations/20260923172500_gym_periodization_39_51/migration.sql');
  if((fitness.match(/<PeriodizationPanel/g)||[]).length!==1)fail('fitness: PeriodizationPanel must render from one owner');
  if(/querySelector|addEventListener|innerHTML|document\./.test(periodizationPanel+periodizationBuilder))fail('fitness: periodization 39 reintroduced imperative DOM lifecycle');
  for(const contract of ['Plantillas','Nueva versión','Historial de versiones','PeriodizationBuilder']){
    if(!periodizationPanel.includes(contract))fail(`fitness: periodization 39 panel missing ${contract}`);
  }
  for(const contract of ['Mesociclo','Carga','Descarga','Volumen objetivo','Intensidad objetivo']){
    if(!periodizationBuilder.includes(contract))fail(`fitness: periodization 39 builder missing ${contract}`);
  }
  for(const contract of ['periodizationStructureSchema','GymPeriodizationProgram','GymPeriodizationTemplate','/gym/periodization/programs/:id/version','pg_advisory_xact_lock','MAX("version")','Solo la versión más reciente puede generar una nueva revisión.','La rutina no pertenece al tenant activo.','La plantilla no pertenece al tenant activo.']){
    if(!gymRoutes.includes(contract))fail(`fitness: backend missing periodization 39 contract ${contract}`);
  }
  for(const contract of ['programKey','version','structure','sourceTemplateId','supersedesId']){
    if(!periodizationMigration.includes(contract))fail(`fitness: periodization 39 migration missing ${contract}`);
  }
  const periodizationStart=gymRoutes.indexOf("router.get('/gym/periodization/templates'");
  const periodizationEnd=gymRoutes.indexOf("router.get('/gym/routines'",periodizationStart);
  const periodizationBlock=gymRoutes.slice(periodizationStart,periodizationEnd);
  if(periodizationStart<0||periodizationEnd<0)fail('fitness: periodization 39 route boundaries missing');
  if(/GymWorkoutSession|GymWorkoutSet|completedSets|actualRir|actualRpe|timer/.test(periodizationBlock))fail('fitness: periodization 39 must not pre-implement workout execution 40');
  const workoutPanel=read('frontend/src/components/fitness/WorkoutSessionPanel.jsx');
  const workoutMigration=read('backend/prisma/migrations/20260923175500_gym_workout_execution_40_51/migration.sql');
  if((fitness.match(/<WorkoutSessionPanel/g)||[]).length!==1)fail('fitness: WorkoutSessionPanel must render from one owner');
  if(/querySelector|addEventListener|innerHTML|document\./.test(workoutPanel))fail('fitness: workout execution 40 reintroduced imperative DOM lifecycle');
  for(const contract of ['Registrar serie','Omitir serie','Carga realizada','Reps realizadas','RIR','RPE','Descanso tras serie','Temporizador de descanso','Completar sesión','setInterval','clearInterval']){
    if(!workoutPanel.includes(contract))fail(`fitness: workout execution 40 UI missing ${contract}`);
  }
  for(const contract of ['workoutSessionSchema','workoutSetSchema','/gym/workout-sessions/:id/sets','/gym/workout-sessions/:id/complete','FOR UPDATE OF s','El ejercicio no pertenece a la rutina de esta sesión.','La sesión ya está completada.']){
    if(!gymRoutes.includes(contract))fail(`fitness: workout execution 40 backend missing ${contract}`);
  }
  for(const contract of ['GymWorkoutSession','GymWorkoutSet','one_active_member_unique','session_exercise_set_unique','restSeconds']){
    if(!workoutMigration.includes(contract))fail(`fitness: workout execution 40 migration missing ${contract}`);
  }
  const workoutStart=gymRoutes.indexOf("router.get('/gym/workout-sessions'");
  const workoutEnd=gymRoutes.indexOf("router.get('/gym/routines'",workoutStart);
  const workoutBlock=gymRoutes.slice(workoutStart,workoutEnd);
  if(workoutStart<0||workoutEnd<0)fail('fitness: workout execution 40 route boundaries missing');
  if(/personalRecord|estimated1RM|e1RM|adherence|volumeBy|performanceChart/.test(workoutBlock))fail('fitness: workout execution 40 must not pre-implement history/performance 41');
  const performancePanel=read('frontend/src/components/fitness/PerformanceHistoryPanel.jsx');
  if((fitness.match(/<PerformanceHistoryPanel/g)||[]).length!==1)fail('fitness: PerformanceHistoryPanel must render from one owner');
  if(/querySelector|addEventListener|innerHTML|document\./.test(performancePanel))fail('fitness: performance history 41 reintroduced imperative DOM lifecycle');
  for(const contract of ['Aplicar período','PR carga','PR reps','e1RM','Volumen por día','Volumen por grupo muscular','Gráfica']){
    if(!performancePanel.includes(contract))fail(`fitness: performance history 41 UI missing ${contract}`);
  }
  for(const contract of ['performanceQuerySchema','/gym/performance','sessionsPerWeek','setAdherencePct','bestEstimated1RmKg','dailyTrend','byExercise','byMuscleGroup']){
    if(!gymRoutes.includes(contract))fail(`fitness: performance history 41 backend missing ${contract}`);
  }
  if(!gymRoutes.includes('reps>=1&&reps<=12')||!gymRoutes.includes('load*(1+reps/30)'))fail('fitness: performance history 41 e1RM applicability/formula contract missing');
  const performanceStart=gymRoutes.indexOf("router.get('/gym/performance'");
  const performanceEnd=gymRoutes.indexOf("router.get('/gym/routines'",performanceStart);
  const performanceBlock=gymRoutes.slice(performanceStart,performanceEnd);
  if(performanceStart<0||performanceEnd<0)fail('fitness: performance history 41 route boundaries missing');
  if(/INSERT INTO|UPDATE public|DELETE FROM/.test(performanceBlock))fail('fitness: performance history 41 must remain derived/read-only');
  if(/substitute|replacementExercise|alternativeExercise/.test(performanceBlock))fail('fitness: performance history 41 must not pre-implement contextual substitutions 42');
  const substitutionPanel=read('frontend/src/components/fitness/ExerciseSubstitutionPanel.jsx');
  const substitutionMigration=read('backend/prisma/migrations/20260923182500_gym_contextual_substitutions_42_51/migration.sql');
  if((workoutPanel.match(/<ExerciseSubstitutionPanel/g)||[]).length!==1)fail('fitness: ExerciseSubstitutionPanel must render from one workout owner');
  if(/querySelector|addEventListener|innerHTML|document\./.test(substitutionPanel))fail('fitness: contextual substitutions 42 reintroduced imperative DOM lifecycle');
  for(const contract of ['Equipamiento disponible','Ejercicio preferido','Ejercicio a excluir','Limitación declarada','Revisión humana requerida','Usar en esta sesión','Volver al prescrito']){
    if(!substitutionPanel.includes(contract))fail(`fitness: contextual substitutions 42 UI missing ${contract}`);
  }
  for(const contract of ['exerciseSubstitutionSchema','availableEquipment','preferredExerciseIds','excludedExerciseIds','declaredLimitations','humanReviewRequired','healthAutomationBlocked:true','limitationsApplied:false','contextInsufficient:true','same_muscle_group','preferred_exercise','equipment_match']){
    if(!gymRoutes.includes(contract))fail(`fitness: contextual substitutions 42 backend missing ${contract}`);
  }
  for(const contract of ['performedExerciseId','substitutionReason','El ejercicio sustituto no pertenece al tenant activo.','El ejercicio sustituto debe conservar el mismo grupo muscular.']){
    if(!gymRoutes.includes(contract))fail(`fitness: contextual substitutions 42 workout provenance missing ${contract}`);
  }
  if(!substitutionMigration.includes('performedExerciseId')||!substitutionMigration.includes('substitutionReason'))fail('fitness: contextual substitutions 42 migration contract missing');
  if(!gymRoutes.includes('COALESCE(ws."performedExerciseId",re."exerciseId")'))fail('fitness: performance 41 must attribute substituted work to performed exercise');
  const substitutionStart=gymRoutes.indexOf("router.post('/gym/exercise-substitutions/suggest'");
  const substitutionEnd=gymRoutes.indexOf("router.get('/gym/routines'",substitutionStart);
  const substitutionBlock=gymRoutes.slice(substitutionStart,substitutionEnd);
  if(substitutionStart<0||substitutionEnd<0)fail('fitness: contextual substitutions 42 route boundaries missing');
  if(!substitutionBlock.includes('b.declaredLimitations.length>0')||!substitutionBlock.includes('suggestions:[]'))fail('fitness: contextual substitutions 42 must fail closed on declared health limitations');
  if(/diagnos|injuryScore|medicalRisk|contraindicationEngine/i.test(substitutionBlock))fail('fitness: contextual substitutions 42 must not infer health decisions');
  if(/ingredient|recipe|macronutrient|micronutrient|mealPlan/i.test(substitutionBlock))fail('fitness: contextual substitutions 42 must not pre-implement nutrition model 43');
  const ingredientLibrary=read('frontend/src/components/fitness/IngredientLibraryPanel.jsx');
  const nutritionBuilder=read('frontend/src/components/fitness/CompleteMealPlanBuilder.jsx');
  const ingredientMigration=read('backend/prisma/migrations/20260923183500_gym_ingredient_model_43_51/migration.sql');
  if((fitness.match(/<IngredientLibraryPanel/g)||[]).length!==1)fail('fitness: ingredient library 43 must render from one owner');
  if((fitness.match(/<CompleteMealPlanBuilder/g)||[]).length!==1)fail('fitness: structured nutrition builder must have one owner after 44/51 supersedes the 43 builder');
  if(/querySelector|addEventListener|innerHTML|document\./.test(ingredientLibrary+nutritionBuilder))fail('fitness: nutrition ingredient 43 reintroduced imperative DOM lifecycle');
  for(const contract of ['Catálogo de ingredientes','Ingrediente','Categoría','Unidad base','Archivar','Reactivar']){
    if(!ingredientLibrary.includes(contract))fail(`fitness: ingredient library 43 UI missing ${contract}`);
  }
  for(const contract of ['Plan alimenticio completo','Agregar comida','Ingrediente','Cantidad','Unidad','Agregar ingrediente']){
    if(!nutritionBuilder.includes(contract))fail(`fitness: nutrition builder 43 UI missing ${contract}`);
  }
  for(const contract of ['ingredientSchema','mealIngredientSchema',"/gym/ingredients",'GymIngredient','GymMealItem','Uno o más ingredientes no pertenecen al tenant activo o están archivados.','prisma.$transaction']){
    if(!gymRoutes.includes(contract))fail(`fitness: nutrition ingredient 43 backend missing ${contract}`);
  }
  for(const contract of ['CREATE TABLE IF NOT EXISTS public."GymIngredient"','CREATE TABLE IF NOT EXISTS public."GymMealItem"','GymIngredient_tenant_name_unique','GymMealItem_meal_fk','GymMealItem_ingredient_fk']){
    if(!ingredientMigration.includes(contract))fail(`fitness: nutrition ingredient 43 migration missing ${contract}`);
  }
  if(/mealLines|Tipo \| kcal \| alimentos/.test(fitness))fail('fitness: nutrition 43 must not use free-text meal parsing');
  if(!fitness.includes('GymVerticalService.ingredients({active:\'true\'})')||!fitness.includes('ingredientId:String(item.ingredientId'))fail('fitness: nutrition 43 structured ingredient wiring missing');
  const nutritionStart=gymRoutes.indexOf("router.get('/gym/ingredients'");
  const nutritionEnd=gymRoutes.indexOf("router.get('/gym/classes'",nutritionStart);
  const nutritionBlock=gymRoutes.slice(nutritionStart,nutritionEnd);
  if(nutritionStart<0||nutritionEnd<0)fail('fitness: nutrition ingredient 43 route boundaries missing');
  if(/micronutrient|vitamin|mineral|fiberG|sodiumMg/i.test(nutritionBlock+ingredientMigration))fail('fitness: nutrition ingredient 43 must not pre-implement nutrient persistence 46');
  const completeMealPlan=read('frontend/src/components/fitness/CompleteMealPlanBuilder.jsx');
  const recipeLibrary=read('frontend/src/components/fitness/NutritionRecipeLibrary.jsx');
  const shoppingPanel=read('frontend/src/components/fitness/NutritionShoppingListPanel.jsx');
  const completeMealMigration=read('backend/prisma/migrations/20260923193000_gym_complete_meal_plan_44_51/migration.sql');
  if((fitness.match(/<CompleteMealPlanBuilder/g)||[]).length!==1)fail('fitness: complete meal plan 44 must render from one owner');
  if((fitness.match(/<NutritionRecipeLibrary/g)||[]).length!==1)fail('fitness: recipe library 44 must render from one owner');
  if((fitness.match(/<NutritionShoppingListPanel/g)||[]).length!==1)fail('fitness: shopping list 44 must render from one owner');
  if(/querySelector|addEventListener|innerHTML|document\./.test(completeMealPlan+recipeLibrary+shoppingPanel))fail('fitness: complete meal plan 44 reintroduced imperative DOM lifecycle');
  if(!completeMealPlan.includes('[7,14,28]'))fail('fitness: complete meal plan 44 must expose the 7/14/28-day horizon');
  for(const contract of ['Día','Porciones','Preparación','Alternativas','Agregar comida']){
    if(!completeMealPlan.includes(contract))fail(`fitness: complete meal plan 44 UI missing ${contract}`);
  }
  if(!shoppingPanel.includes('Lista de compras')||!shoppingPanel.includes('GymVerticalService.shoppingList('))fail('fitness: shopping list 44 UI/service owner missing');
  for(const contract of ['recipeSchema','completeNutritionSchema',"router.get('/gym/recipes'","router.post('/gym/recipes'","router.get('/gym/nutrition/:id/shopping-list'",'GymRecipeItem','GymMealAlternative','Las recetas del plan deben estar activas y pertenecer al tenant.']){
    if(!gymRoutes.includes(contract))fail(`fitness: complete meal plan 44 backend missing ${contract}`);
  }
  for(const contract of ['GymRecipe','GymRecipeItem','GymMealAlternative','durationDays','dayIndex','recipeId','servings','preparation']){
    if(!completeMealMigration.includes(contract))fail(`fitness: complete meal plan 44 migration missing ${contract}`);
  }
  if(!gymRoutes.includes('meal.dayIndex>Number(value.durationDays)')||!gymRoutes.includes('Cada comida debe pertenecer al horizonte configurado del plan.'))fail('fitness: complete meal plan 44 horizon validation missing');
  const shoppingStart=gymRoutes.indexOf("router.get('/gym/nutrition/:id/shopping-list'");
  const shoppingEnd=gymRoutes.indexOf("router.get('/gym/classes'",shoppingStart);
  const shoppingBlock=gymRoutes.slice(shoppingStart,shoppingEnd);
  if(shoppingStart<0||shoppingEnd<0)fail('fitness: complete meal plan 44 shopping-list route boundaries missing');
  if(/INSERT INTO|UPDATE public|DELETE FROM/.test(shoppingBlock))fail('fitness: shopping list 44 must remain derived/read-only');
  if(/allerg|intoler|preferenceRule|micronutrient|adherence/i.test(completeMealPlan+recipeLibrary+shoppingPanel+completeMealMigration))fail('fitness: complete meal plan 44 must not pre-implement 45-47');

  const mealPlanMigration=read('backend/prisma/migrations/20260923190000_gym_complete_meal_plan_44_51/migration.sql');
  for(const contract of ['GymMeal_dayOfWeek_check','GymMeal_sortOrder_check','NULL preserves legacy meals']){
    if(!mealPlanMigration.includes(contract))fail(`fitness: complete meal plan 44 weekly migration missing ${contract}`);
  }
  if(!completeMealMigration.includes('GymMeal_plan_dayIndex_order_unique')||!completeMealMigration.includes('DROP INDEX IF EXISTS public."GymMeal_plan_day_order_unique"'))fail('fitness: complete meal plan 44 must replace weekly uniqueness with absolute-day uniqueness for 14/28-day plans');
  if(!fitness.includes('dayIndex:Number(meal.dayIndex)')||!fitness.includes('dayOfWeek:Number(meal.dayOfWeek)')||!fitness.includes('sortOrder:Number(meal.sortOrder)')||!fitness.includes('Inicio del plan')||!fitness.includes('Fin del plan'))fail('fitness: complete meal plan 44 scheduling is not wired end-to-end');
  if(!gymRoutes.includes('ORDER BY m."dayIndex" NULLS LAST,m."sortOrder"'))fail('fitness: complete meal plan 44 reads must preserve absolute multiweek order');
  if(!completeMealMigration.includes('GymMealAlternative_servings_positive'))fail('fitness: complete meal plan 44 alternatives must persist explicit portions');
  if(!gymRoutes.includes('Una comida con receta principal no puede mezclar ingredientes directos.'))fail('fitness: complete meal plan 44 must keep recipe and direct-item authorities exclusive');
  const quickNutrition=productivity.slice(productivity.indexOf('export function FitnessNutritionQuickTool'),productivity.indexOf('export function FitnessClientTransferTool'));
  if(!quickNutrition.includes('Persistencia estructurada')||/GymVerticalService\.createNutrition\(|FitnessNutritionService\.toApiMeals\(/.test(quickNutrition))fail('fitness: quick nutrition must not bypass canonical 44 persistence');

  const nutritionRules=read('frontend/src/components/fitness/NutritionRulesPanel.jsx');
  const nutritionRulesMigration=read('backend/prisma/migrations/20260923203000_gym_nutrition_rules_45_51/migration.sql');
  if((fitness.match(/<NutritionRulesPanel/g)||[]).length!==1)fail('fitness: nutrition rules 45 must render from one owner');
  if(/querySelector|addEventListener|innerHTML|document\./.test(nutritionRules))fail('fitness: nutrition rules 45 reintroduced imperative DOM lifecycle');
  for(const contract of ['Restricciones y preferencias','Alergia declarada','Intolerancia declarada','Exclusión','Preferido','nunca modifica el plan automáticamente']){
    if(!nutritionRules.includes(contract))fail(`fitness: nutrition rules 45 UI missing ${contract}`);
  }
  for(const contract of ['nutritionRuleKindSchema','nutritionRuleSchema',"router.get('/gym/nutrition-rules'","router.post('/gym/nutrition-rules'","router.patch('/gym/nutrition-rules/:id'",'GymNutritionRule','El plan contiene ingredientes restringidos declarados para el cliente:']){
    if(!gymRoutes.includes(contract))fail(`fitness: nutrition rules 45 backend missing ${contract}`);
  }
  for(const contract of ['GymNutritionRule','GymNutritionRule_kind_check','GymNutritionRule_tenant_member_ingredient_kind_unique',"'allergy','intolerance','exclusion','preferred'"]){
    if(!nutritionRulesMigration.includes(contract))fail(`fitness: nutrition rules 45 migration missing ${contract}`);
  }
  if(!gymRoutes.includes("r.\"kind\" IN ('allergy','intolerance','exclusion')"))fail('fitness: nutrition rules 45 must block only explicit blocking kinds');
  if(!gymRoutes.includes('GymRecipeItem')||!gymRoutes.includes('planIngredientIds'))fail('fitness: nutrition rules 45 must inspect direct and recipe ingredients');
  if(/autoSelect|automaticSubstitut|inferAllerg|diagnos/i.test(nutritionRules+nutritionRulesMigration))fail('fitness: nutrition rules 45 must not infer clinical restrictions or auto-select meals');

  const nutrientProfilePanel=read('frontend/src/components/fitness/IngredientNutritionProfilePanel.jsx');
  const nutrientSnapshotPanel=read('frontend/src/components/fitness/NutritionSnapshotPanel.jsx');
  const nutrientMigration=read('backend/prisma/migrations/20260923213000_gym_nutrient_composition_46_51/migration.sql');
  if((fitness.match(/<IngredientNutritionProfilePanel/g)||[]).length!==1)fail('fitness: ingredient nutrient profile 46 must render from one owner');
  if((fitness.match(/<NutritionSnapshotPanel/g)||[]).length!==1)fail('fitness: nutrient snapshot 46 must render from one owner');
  if(/querySelector|addEventListener|innerHTML|document\./.test(nutrientProfilePanel+nutrientSnapshotPanel))fail('fitness: nutrient composition 46 reintroduced imperative DOM lifecycle');
  for(const contract of ['Composición nutricional por ingrediente','Cantidad base','Unidad base','Energía kcal','Proteína g','Carbohidratos g','Grasa g','Fibra g','Micronutrientes','Guardar nueva versión']){
    if(!nutrientProfilePanel.includes(contract))fail(`fitness: nutrient profile 46 UI missing ${contract}`);
  }
  for(const contract of ['Snapshot nutricional del plan','Totales congelados al crear el plan','Completo','Incompleto','Plan sin snapshot']){
    if(!nutrientSnapshotPanel.includes(contract))fail(`fitness: nutrient snapshot 46 UI missing ${contract}`);
  }
  for(const contract of ['micronutrientSchema','ingredientNutritionProfileSchema','createPlanNutrientSnapshot',"router.get('/gym/ingredients/:id/nutrition-profiles'","router.post('/gym/ingredients/:id/nutrition-profiles'","router.get('/gym/nutrition/:id/nutrients'",'MISSING_PROFILE','UNIT_MISMATCH','GymIngredientNutritionProfile','GymIngredientMicronutrient','GymNutritionPlanNutrientSnapshot']){
    if(!gymRoutes.includes(contract))fail(`fitness: nutrient composition 46 backend missing ${contract}`);
  }
  for(const contract of ['GymIngredientNutritionProfile','GymIngredientMicronutrient','GymNutritionPlanNutrientSnapshot','version','basisQuantity','basisUnit','micronutrients','issues','profileRefs']){
    if(!nutrientMigration.includes(contract))fail(`fitness: nutrient composition 46 migration missing ${contract}`);
  }
  if(!gymRoutes.includes('String(occurrence.unit)!==String(profile.basisUnit)'))fail('fitness: nutrient composition 46 must not silently convert incompatible units');
  if(!gymRoutes.includes('ORDER BY p."ingredientId",p."version" DESC'))fail('fitness: nutrient composition 46 snapshot must resolve latest profile only at creation time');
  if(!gymRoutes.includes('await createPlanNutrientSnapshot(tx,tenantId,createdPlan.id'))fail('fitness: nutrition plan creation must freeze the nutrient snapshot transactionally');
  if(/UPDATE public\."GymIngredientNutritionProfile"|DELETE FROM public\."GymIngredientNutritionProfile"/.test(gymRoutes))fail('fitness: nutrient profiles 46 must remain immutable/versioned');
  if(/adherence|compliance|consumedAt|mealCompletion/i.test(nutrientProfilePanel+nutrientSnapshotPanel+nutrientMigration))fail('fitness: nutrient composition 46 must not pre-implement adherence 47');

  const adherencePanel=read('frontend/src/components/fitness/FitnessAdherencePanel.jsx');
  const adherenceMigration=read('backend/prisma/migrations/20260923220000_gym_integral_adherence_47_51/migration.sql');
  const mediaRoutes47=read('backend/src/modules/media/media.routes.ts');
  if((fitness.match(/<FitnessAdherencePanel/g)||[]).length!==1)fail('fitness: integral adherence 47 must render from one owner');
  if(/querySelector|addEventListener|innerHTML|document\./.test(adherencePanel))fail('fitness: integral adherence 47 reintroduced imperative DOM lifecycle');
  for(const contract of ['Adherencia integral','Registro de comidas','Hábitos','Objetivos y evolución','Mediciones canónicas','Entrenamientos canónicos','Fotos de progreso autorizadas','autorización explícita']){
    if(!adherencePanel.includes(contract))fail(`fitness: integral adherence 47 UI missing ${contract}`);
  }
  for(const contract of ['GymMealAdherenceEvent','GymHabit','GymHabitCheckIn','GymAdherenceGoal','GymProgressPhoto','authorizationConfirmed']){
    if(!adherenceMigration.includes(contract))fail(`fitness: integral adherence 47 migration missing ${contract}`);
  }
  for(const contract of ["router.get('/gym/adherence'","router.post('/gym/adherence/meals'","router.post('/gym/adherence/habits'","router.post('/gym/adherence/habits/:id/checkins'","router.post('/gym/adherence/goals'","router.post('/gym/adherence/photos'",'GymWorkoutSession','GymAssessment']){
    if(!gymRoutes.includes(contract))fail(`fitness: integral adherence 47 backend missing ${contract}`);
  }
  if(!mediaRoutes47.includes("'gym-progress'")||!adherencePanel.includes("entityType:'gym-progress'"))fail('fitness: integral adherence 47 authorized photos must use isolated gym-progress storage');
  const adherenceRead=gymRoutes.slice(gymRoutes.indexOf("router.get('/gym/adherence'"),gymRoutes.indexOf("router.post('/gym/adherence/meals'"));
  if(/INSERT INTO public\."GymWorkoutSession"|INSERT INTO public\."GymAssessment"/.test(adherenceRead))fail('fitness: integral adherence 47 must derive workouts and assessments from canonical authorities');
  if(/CREATE TABLE[\s\S]{0,200}(streak|badge|leaderboard|points)/i.test(adherenceMigration))fail('fitness: integral adherence 47 must not own gamification or streaks');
}

const css=read('frontend/src/styles/erp-runtime.css');
for(const required of ['cg.visual.responsive','cg-dental-tooth-grid','cg-dental-list','cg-gym-v1124-grid','min-height:44px']){
  if(!css.includes(required))fail(`responsive owner missing ${required}`);
}

if(!process.exitCode)console.log('[erp-ui-wave-a][PASS] 5 vertical routes MIGRATED; no imperative vertical lifecycle; Cg*/MUI owners enforced.');
