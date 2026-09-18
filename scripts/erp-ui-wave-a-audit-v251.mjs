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
}

const css=read('frontend/src/styles/erp-runtime.css');
for(const required of ['cg.visual.responsive','cg-dental-tooth-grid','cg-dental-list','cg-gym-v1124-grid','min-height:44px']){
  if(!css.includes(required))fail(`responsive owner missing ${required}`);
}

if(!process.exitCode)console.log('[erp-ui-wave-a][PASS] 5 vertical routes classified; no legacy budget growth; Veterinary dossier uses Cg*/MUI.');
