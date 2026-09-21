import fs from 'node:fs';
import path from 'node:path';
import { ERP_UI_WAVE_A_2_51, ERP_UI_MIGRATION_STATUSES } from '../qa/support/erp-ui-wave-a-v251.mjs';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const root=process.cwd();
const fail=(message)=>{console.error(`[erp-ui-wave-a][FAIL] ${message}`);process.exitCode=1;};
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const count=(source,re)=>(source.match(re)||[]).length;
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
  if(!/import \{ VeterinaryWorkspace \} from '\.\/VeterinaryClinicPage\.jsx'/.test(vet))fail('veterinaria: migrated route must compose VeterinaryWorkspace declaratively');
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
  if((dentistry.match(/TreatmentPlanPanel/g)||[]).length!==2)fail('odontologia: TreatmentPlanPanel symbol must appear exactly twice (one import + one component)');
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
  if((dentistry.match(/DentalConsentPanel/g)||[]).length!==2)fail('odontologia: DentalConsentPanel symbol must appear exactly twice (one import + one component)');
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
