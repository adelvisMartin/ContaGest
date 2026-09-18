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
  const periodontal=read('frontend/src/components/dentistry/PeriodontalChartPanel.jsx');
  if(!dentistry.includes('PeriodontalChartPanel'))fail('odontologia: structured periodontogram panel is not composed');
  if(/querySelector|addEventListener|innerHTML|document\./.test(periodontal))fail('odontologia: periodontogram reintroduced imperative DOM lifecycle');
  for(const contract of ['PERIODONTAL_SITES','probingDepthMm','gingivalMarginMm','bleeding','suppuration','plaque','mobilityGrade','furcationGrade','previousSameTooth','maxProbingDepth','maxAttachmentLevel','Evolución periodontal']){
    if(!periodontal.includes(contract))fail(`odontologia: missing periodontogram contract ${contract}`);
  }
  if(!dentistry.includes("type:'periodontal-chart'")||!dentistry.includes('clinicalData:{periodontogram:'))fail('odontologia: periodontogram must persist through canonical CareEncounter payload');
  const treatmentPlan=read('frontend/src/components/dentistry/TreatmentPlanPanel.jsx');
  if(!dentistry.includes('TreatmentPlanPanel'))fail('odontologia: treatment plan panel is not composed');
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
