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
    'frontend/src/components/veterinary/VeterinaryClinicalInventoryPanel.jsx',
    'frontend/src/components/veterinary/VeterinaryFinancialPanel.jsx'
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
  if(!veterinaryFinancial.includes('reportVeterinaryError'))fail('veterinaria: financial workflow lacks safe error reporting');
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
  for(const contract of ['VeterinaryFinancialCase','VeterinaryFinancialConsumptionLink','estimateSha256','authorizationConsentId','salesInvoiceId','REFERENCES public."Tenant"','ENABLE ROW LEVEL SECURITY','REVOKE ALL']){
    if(!veterinaryFinancialMigration.includes(contract))fail(`veterinaria: missing financial persistence contract ${contract}`);
  }
  if(!salesRoutes.includes('VeterinaryFinancialCase')||!salesRoutes.includes('flujo financiero veterinario'))fail('sales: veterinary provenance-linked drafts must be protected from deletion');

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
}

const css=read('frontend/src/styles/erp-runtime.css');
for(const required of ['cg.visual.responsive','cg-dental-tooth-grid','cg-dental-list','cg-gym-v1124-grid','min-height:44px']){
  if(!css.includes(required))fail(`responsive owner missing ${required}`);
}

if(!process.exitCode)console.log('[erp-ui-wave-a][PASS] 5 vertical routes MIGRATED; no imperative vertical lifecycle; Cg*/MUI owners enforced.');
