import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const access=read('frontend/src/services/sessionAccessGuard.js');
const urlState=read('frontend/src/services/urlStateService.js');
const query=read('frontend/src/services/queryParamEnhancer.js');
const runtime=read('frontend/src/styles/erp-runtime.css');
const shellCss=read('frontend/src/styles/shell-ux-v1126.css');
const formCss=read('frontend/src/styles/form-contract-v1126.css');
const vet=read('frontend/src/pages/VeterinaryClinicPageV1123.jsx');
const nutrition=read('frontend/src/services/fitnessNutritionService.js');
const productivity=read('frontend/src/services/fitnessProductivityEnhancer.js');
const foodApi=read('api/fooddata.ts');
const vercel=read('vercel.json');

test('internal administrator and active QA license can see licensed QA modules without client privilege escalation',()=>{
  assert.match(access,/if \(isActiveQaLicense\(state, route\)\) return true/);
  assert.match(access,/if \(profile\.isAdmin && !profile\.isClient\) return true/);
  assert.match(access,/if \(profile\.isClient && license\)/);
  assert.match(access,/if \(!validLicense\(license\)\) return false/);
});

test('mobile sidebar category is an accordion and child route owns navigation',()=>{
  assert.match(urlState,/closest\('#mainMenu \.cg-area-toggle'\)/);
  assert.match(urlState,/event\.stopImmediatePropagation\(\)/);
  assert.match(urlState,/details\.open = !details\.open/);
  assert.match(urlState,/rememberSidebarSections\(\)/);
  assert.match(query,/cg_sidebar_sections_v1126/);
});

test('ContaGest URLs are canonical at root and old Control Hipico path redirects away from ERP router',()=>{
  assert.match(urlState,/ERP_CANONICAL_PATH = '\/'/);
  assert.match(urlState,/return `\$\{ERP_CANONICAL_PATH\}\?\$\{search\.toString\(\)\}`/);
  const config=JSON.parse(vercel);
  assert.ok(config.routes.some((route)=>route.src==='/control-hipico'&&route.status===308&&route.headers?.Location==='/hipico-control/'));
});

test('shell contract removes duplicate theme icon and provides genuine light sidebar',()=>{
  assert.match(shellCss,/#btnTema::before,#btnTema::after\{content:none/);
  assert.match(shellCss,/\.hf-breadcrumbs-host \.mui-react-mount/);
  assert.match(shellCss,/background:#f7faff!important/);
  assert.match(shellCss,/\.hf-menu-item\.active/);
  assert.match(shellCss,/background:#2758b9!important/);
});

test('universal form geometry uses static labels and a single control border',()=>{
  assert.match(formCss,/\.cgx-label\{position:static!important/);
  assert.match(formCss,/\.cgx-field-normalized\{/);
  assert.match(formCss,/border:1px solid var\(--cg-border\)!important/);
  assert.match(runtime,/form-contract-v1126\.css/);
});

test('veterinary dossier is compact master detail and no longer renders fact cards as nested Paper components',()=>{
  assert.match(vet,/cg-vet-master-detail/);
  assert.match(vet,/cg-vet-fact/);
  assert.match(vet,/cg-vet-empty/);
  assert.doesNotMatch(vet,/function KeyValue[\s\S]{0,600}<Paper/);
});

test('nutrition suggestions include practical protein substitutions and FoodData Central lookup',()=>{
  assert.match(nutrition,/proteinAlternatives/);
  assert.match(nutrition,/atún o sardinas/);
  assert.match(nutrition,/huevos \+ claras/);
  assert.match(productivity,/FoodDataCentralService/);
  assert.match(productivity,/Verificar alimento · USDA FoodData Central/);
});

test('FoodData Central key stays server-side with bounded fixed-host proxy',()=>{
  assert.match(foodApi,/process\.env\.FDC_API_KEY/);
  assert.match(foodApi,/USDA_BASE = 'https:\/\/api\.nal\.usda\.gov\/fdc\/v1'/);
  assert.match(foodApi,/MAX_PAGE_SIZE = 25/);
  assert.match(foodApi,/USDA_DEMO_KEY = 'DEMO_KEY'/);
  assert.doesNotMatch(productivity,/FDC_API_KEY|api\.nal\.usda\.gov/);
});
