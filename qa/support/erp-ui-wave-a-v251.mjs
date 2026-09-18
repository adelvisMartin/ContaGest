export const ERP_UI_WAVE_A_2_51 = Object.freeze([
  {
    route:'odontologia',
    module:'health/dentistry',
    renderer:'frontend/src/pages/DentistryPracticePage.js',
    status:'LEGACY_EXCEPTION_APPROVED',
    canonicalRegions:['cg.visual.responsive/shared-runtime-adapter'],
    owners:{pageHeader:'legacy-kit/PageHeader',actions:'legacy-kit/Button',forms:'legacy-kit/Field|Select|Textarea',dialogs:'none',data:'legacy-html',kpi:'legacy-kit/StatCard'},
    cssOwners:['frontend/src/styles/erp-runtime.css','frontend/src/styles/module-adapters.css','frontend/src/styles/contagest-visual-system-v12.css'],
    legacyBefore:['components/ui/index.js -> kit.js','imperative HTML renderer','raw tooth buttons'],
    legacyBudget:{kitImport:1,rawButtonString:1,rawInputString:1,rawSelectString:0,rawTextareaString:0,cgxBtn:0},
    exception:{owner:'roadmap 3/51',reason:'Renderer HTML/DOM imperativo; su sustitución completa por React declarativo pertenece a 3/51 para evitar mezclar dos arquitecturas en esta ola visual.',approvedAt:'2026-09-18',reviewBy:'3/51'},
    qa:{source:'PASS_REQUIRED',phone360:'NOT_EXECUTED',phone390:'NOT_EXECUTED',phone430:'NOT_EXECUTED',tablet768:'NOT_EXECUTED',desktop1366:'NOT_EXECUTED'}
  },
  {
    route:'veterinaria',
    module:'health/veterinary',
    renderer:'frontend/src/pages/VeterinaryClinicPageV1123.jsx',
    status:'LEGACY_EXCEPTION_APPROVED',
    canonicalRegions:['CgProvider','CgButton','CgTextField','CgState','CgStatusChip','MUI layout/list/dialog'],
    owners:{pageHeader:'legacy veterinary surface',actions:'CgButton',forms:'CgTextField + MUI TextField',dialogs:'MUI Dialog + CgButton',data:'MUI List/Paper',kpi:'CgStatusChip'},
    cssOwners:['frontend/src/styles/erp-runtime.css','frontend/src/styles/module-adapters.css','frontend/src/styles/contagest-visual-system-v12.css'],
    legacyBefore:['VeterinaryClinicLegacy mounted below canonical dossier'],
    legacyBudget:{legacyVetImport:3,kitImport:0,rawButtonString:0,rawInputString:0,rawSelectString:0,rawTextareaString:0,cgxBtn:0},
    exception:{owner:'roadmap 3/51',reason:'El dossier master/detail ya consume Cg*/MUI, pero la ruta aún monta VeterinaryClinicLegacy; retirar el doble renderer pertenece a 3/51.',approvedAt:'2026-09-18',reviewBy:'3/51'},
    qa:{source:'PASS_REQUIRED',phone360:'NOT_EXECUTED',phone390:'NOT_EXECUTED',phone430:'NOT_EXECUTED',tablet768:'NOT_EXECUTED',desktop1366:'NOT_EXECUTED'}
  },
  {
    route:'gimnasio',
    module:'fitness/gym',
    renderer:'frontend/src/pages/GymManagementPage.js',
    status:'LEGACY_EXCEPTION_APPROVED',
    canonicalRegions:['cg.visual.responsive/shared-runtime-adapter'],
    owners:{pageHeader:'legacy-kit/PageHeader',actions:'legacy-kit/Button + raw cgx buttons',forms:'imperative HTML',dialogs:'none',data:'imperative HTML lists',kpi:'imperative HTML cards'},
    cssOwners:['frontend/src/styles/erp-runtime.css','frontend/src/styles/module-adapters.css','frontend/src/styles/contagest-visual-system-v12.css'],
    legacyBefore:['components/ui/index.js -> kit.js','imperative HTML renderer','raw cgx buttons/fields'],
    legacyBudget:{kitImport:1,rawButtonString:16,rawInputString:30,rawSelectString:15,rawTextareaString:4,cgxBtn:30},
    exception:{owner:'roadmap 3/51',reason:'Gimnasio comparte renderer imperativo con Rutinas y Nutrición; la conversión completa a React declarativo es 3/51.',approvedAt:'2026-09-18',reviewBy:'3/51'},
    qa:{source:'PASS_REQUIRED',phone360:'NOT_EXECUTED',phone390:'NOT_EXECUTED',phone430:'NOT_EXECUTED',tablet768:'NOT_EXECUTED',desktop1366:'NOT_EXECUTED'}
  },
  {
    route:'rutinas',
    module:'fitness/routines',
    renderer:'frontend/src/pages/GymManagementPage.js',
    status:'LEGACY_EXCEPTION_APPROVED',
    canonicalRegions:['cg.visual.responsive/shared-runtime-adapter'],
    owners:{pageHeader:'legacy-kit/PageHeader',actions:'legacy-kit/Button + raw cgx buttons',forms:'imperative HTML',dialogs:'none',data:'imperative HTML lists',kpi:'imperative HTML cards'},
    cssOwners:['frontend/src/styles/erp-runtime.css','frontend/src/styles/module-adapters.css','frontend/src/styles/contagest-visual-system-v12.css'],
    legacyBefore:['shared GymManagementPage imperative renderer'],
    legacyBudget:{kitImport:1,rawButtonString:16,rawInputString:30,rawSelectString:15,rawTextareaString:4,cgxBtn:30},
    exception:{owner:'roadmap 3/51',reason:'Ruta especializada del mismo renderer de Gimnasio; se migra atómicamente con él en 3/51.',approvedAt:'2026-09-18',reviewBy:'3/51'},
    qa:{source:'PASS_REQUIRED',phone360:'NOT_EXECUTED',phone390:'NOT_EXECUTED',phone430:'NOT_EXECUTED',tablet768:'NOT_EXECUTED',desktop1366:'NOT_EXECUTED'}
  },
  {
    route:'nutricion',
    module:'fitness/nutrition',
    renderer:'frontend/src/pages/GymManagementPage.js',
    status:'LEGACY_EXCEPTION_APPROVED',
    canonicalRegions:['cg.visual.responsive/shared-runtime-adapter'],
    owners:{pageHeader:'legacy-kit/PageHeader',actions:'legacy-kit/Button + raw cgx buttons',forms:'imperative HTML',dialogs:'none',data:'imperative HTML lists',kpi:'imperative HTML cards'},
    cssOwners:['frontend/src/styles/erp-runtime.css','frontend/src/styles/module-adapters.css','frontend/src/styles/contagest-visual-system-v12.css'],
    legacyBefore:['shared GymManagementPage imperative renderer'],
    legacyBudget:{kitImport:1,rawButtonString:16,rawInputString:30,rawSelectString:15,rawTextareaString:4,cgxBtn:30},
    exception:{owner:'roadmap 3/51',reason:'Ruta especializada del mismo renderer de Gimnasio; se migra atómicamente con él en 3/51.',approvedAt:'2026-09-18',reviewBy:'3/51'},
    qa:{source:'PASS_REQUIRED',phone360:'NOT_EXECUTED',phone390:'NOT_EXECUTED',phone430:'NOT_EXECUTED',tablet768:'NOT_EXECUTED',desktop1366:'NOT_EXECUTED'}
  }
]);

export const ERP_UI_WAVE_A_ROUTES=Object.freeze(ERP_UI_WAVE_A_2_51.map((item)=>item.route));
export const ERP_UI_MIGRATION_STATUSES=Object.freeze(['MIGRATED','LEGACY_EXCEPTION_APPROVED','OUT_OF_SCOPE_NON_UI']);
