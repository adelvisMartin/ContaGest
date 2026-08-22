import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MODULE_VISUAL_ROUTES } from '../qa/support/module-visual-catalog.mjs';

const root=process.cwd();
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');

test('index no longer embeds the hidden historical global design system',()=>{
  const html=read('frontend','index.html');
  assert.doesNotMatch(html,/<style\b/i);
  assert.doesNotMatch(html,/(?:linear|radial|conic)-gradient\s*\(/i);
  assert.match(html,/src\/app\.js/);
});

test('shell is mode-scoped and no longer injects global KPI/quickbar clutter',()=>{
  const layout=read('frontend','src','components','layout.js');
  assert.match(layout,/modulesByArea\(state\.settings\?\.businessMode\|\|'admin',\{includeAll:false\}\)/);
  assert.match(layout,/PRIMARY_ROUTES/);
  assert.match(layout,/hf-primary-nav/);
  assert.doesNotMatch(layout,/<section class="hf-kpi-strip"/);
  assert.doesNotMatch(layout,/hf-quickbar|quickTabs/);
  assert.doesNotMatch(layout,/theme==='enterprise'/);
});

test('canonical visual owner has neutral dark/light tokens and no gradients',()=>{
  const visual=read('frontend','src','styles','contagest-visual-system-v12.css');
  assert.match(visual,/--cg-v-bg:\s*#17181b/);
  assert.match(visual,/--cg-v-surface:\s*#1d1e22/);
  assert.match(visual,/--cg-v-bg:\s*#f5f6f8/);
  assert.doesNotMatch(visual,/(?:linear|radial|conic)-gradient\s*\(/i);
  assert.match(visual,/text-overflow:clip!important/);
  assert.match(visual,/overflow:visible!important/);
});

test('psychology appointment flow has a compact calendar, safe labels and a real POST binding',()=>{
  const page=read('frontend','src','pages','PsychologyPracticePage.js');
  const adapters=read('frontend','src','styles','module-adapters.css');
  assert.match(page,/UUID_RE/);
  assert.match(page,/Paciente sin nombre/);
  assert.match(page,/mountSubmit\('#psychAppointmentForm'/);
  assert.match(page,/HealthVerticalService\.createAppointment/);
  assert.match(page,/cg-psych-calendar/);
  assert.match(adapters,/cg-psych-calendar/);
  assert.match(adapters,/cg-psych-editor-grid/);
});

test('veterinary route and dossier share the canonical ContaGest MUI theme',()=>{
  const app=read('frontend','src','app.js');
  const mui=read('frontend','src','components','muiRuntime.js');
  const veterinary=read('frontend','src','pages','VeterinaryClinicPage.jsx');
  const dossier=read('frontend','src','pages','VeterinaryClinicPageV1123.jsx');
  assert.match(app,/veterinaria:\['\.\/pages\/VeterinaryClinicPageV1123\.jsx','VeterinaryClinicPage'\]/);
  assert.match(mui,/export function createContaGestMuiTheme/);
  assert.doesNotMatch(mui,/mui-global-runtime\.css|enterprise/);
  assert.match(veterinary,/createContaGestMuiTheme/);
  assert.doesNotMatch(veterinary,/createVetTheme|createTheme\(|<CssBaseline|<Toaster/);
  assert.match(dossier,/createContaGestMuiTheme/);
  assert.match(dossier,/<ThemeProvider theme=\{theme\}>/);
  assert.doesNotMatch(dossier,/createTheme\(|enterprise/);
  assert.match(veterinary,/HealthVerticalService\.createAppointment/);
  assert.match(veterinary,/HealthVerticalService\.updateAppointment/);
  assert.match(veterinary,/HealthVerticalService\.deleteAppointment/);
});

test('route catalog remains exhaustive',()=>{
  assert.equal(MODULE_VISUAL_ROUTES.length,58);
  assert.equal(new Set(MODULE_VISUAL_ROUTES).size,58);
});

test('P0 engineering skills and deterministic agent router exist',()=>{
  for(const skill of ['contagest-accounting-integrity','contagest-tenant-isolation-rbac','contagest-db-migration-safety','contagest-release-evidence','contagest-bcp-dr','contagest-functional-module-audit']){
    const file=path.join(root,'.agents','skills',skill,'SKILL.md');
    assert.equal(fs.existsSync(file),true,`${skill} no existe`);
    assert.ok(fs.statSync(file).size>300,`${skill} está vacío/incompleto`);
  }
  assert.equal(fs.existsSync(path.join(root,'qa','support','domain-risk-catalog.mjs')),true);
  assert.equal(fs.existsSync(path.join(root,'scripts','agent-gate-router.mjs')),true);
  assert.equal(fs.existsSync(path.join(root,'scripts','erp-module-function-audit.mjs')),true);
});
