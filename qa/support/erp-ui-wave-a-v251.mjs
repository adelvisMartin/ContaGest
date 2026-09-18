export const ERP_UI_WAVE_A_2_51 = Object.freeze([
  {
    route:'odontologia',
    module:'health/dentistry',
    renderer:'frontend/src/pages/DentistryPracticePage.jsx',
    status:'MIGRATED',
    canonicalRegions:['single React root','CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgEmptyState','MUI layout'],
    owners:{pageHeader:'CgPageHeader',actions:'CgButton',forms:'CgTextField + CgSelect',dialogs:'none',data:'React state + MUI Paper/Stack',kpi:'React metrics + CgStatusChip'},
    cssOwners:['frontend/src/styles/erp-runtime.css','frontend/src/styles/module-adapters.css','frontend/src/styles/contagest-visual-system-v12.css'],
    legacyBefore:['components/ui/index.js -> kit.js','imperative HTML renderer','raw tooth buttons','mountSubmit DOM lifecycle'],
    legacyBudget:{kitImport:0,rawButtonString:0,rawInputString:0,rawSelectString:0,rawTextareaString:0,cgxBtn:0},
    qa:{source:'PASS_REQUIRED',phone360:'NOT_EXECUTED',phone390:'NOT_EXECUTED',phone430:'NOT_EXECUTED',tablet768:'NOT_EXECUTED',desktop1366:'NOT_EXECUTED'}
  },
  {
    route:'veterinaria',
    module:'health/veterinary',
    renderer:'frontend/src/pages/VeterinaryClinicPageV1123.jsx',
    status:'MIGRATED',
    canonicalRegions:['single React root','CgProvider','CgButton','CgTextField','CgState','CgStatusChip','MUI layout/list/dialog'],
    owners:{pageHeader:'VeterinaryWorkspace/MUI',actions:'CgButton + MUI Button',forms:'CgTextField + MUI TextField',dialogs:'MUI Dialog + CgButton',data:'MUI List/Table/Paper',kpi:'CgStatusChip + MUI metrics'},
    cssOwners:['frontend/src/styles/erp-runtime.css','frontend/src/styles/module-adapters.css','frontend/src/styles/contagest-visual-system-v12.css'],
    legacyBefore:['VeterinaryClinicLegacy page lifecycle removed in 3/51; dossier and full workspace now share one React root.'],
    legacyBudget:{legacyVetImport:0,kitImport:0,rawButtonString:0,rawInputString:0,rawSelectString:0,rawTextareaString:0,cgxBtn:0},
    qa:{source:'PASS_REQUIRED',phone360:'NOT_EXECUTED',phone390:'NOT_EXECUTED',phone430:'NOT_EXECUTED',tablet768:'NOT_EXECUTED',desktop1366:'NOT_EXECUTED'}
  },
  {
    route:'gimnasio',
    module:'fitness/gym',
    renderer:'frontend/src/pages/GymManagementPage.jsx',
    status:'MIGRATED',
    canonicalRegions:['single React root','CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgEmptyState','MUI layout/tabs/forms'],
    owners:{pageHeader:'CgPageHeader',actions:'CgButton',forms:'CgTextField + CgSelect + MUI Checkbox',dialogs:'none',data:'React state + MUI Paper/Stack',kpi:'React metrics + CgStatusChip'},
    cssOwners:['frontend/src/styles/erp-runtime.css','frontend/src/styles/module-adapters.css','frontend/src/styles/contagest-visual-system-v12.css'],
    legacyBefore:['components/ui/index.js -> kit.js','imperative HTML renderer','MutationObserver productivity enhancer','raw cgx buttons/fields'],
    legacyBudget:{kitImport:0,rawButtonString:0,rawInputString:0,rawSelectString:0,rawTextareaString:0,cgxBtn:0},
    qa:{source:'PASS_REQUIRED',phone360:'NOT_EXECUTED',phone390:'NOT_EXECUTED',phone430:'NOT_EXECUTED',tablet768:'NOT_EXECUTED',desktop1366:'NOT_EXECUTED'}
  },
  {
    route:'rutinas',
    module:'fitness/routines',
    renderer:'frontend/src/pages/GymManagementPage.jsx',
    status:'MIGRATED',
    canonicalRegions:['single React root','CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgEmptyState','MUI layout/tabs/forms'],
    owners:{pageHeader:'CgPageHeader',actions:'CgButton',forms:'CgTextField + CgSelect + MUI Checkbox',dialogs:'none',data:'React state + MUI Paper/Stack',kpi:'React metrics + CgStatusChip'},
    cssOwners:['frontend/src/styles/erp-runtime.css','frontend/src/styles/module-adapters.css','frontend/src/styles/contagest-visual-system-v12.css'],
    legacyBefore:['shared GymManagementPage imperative renderer','MutationObserver productivity enhancer'],
    legacyBudget:{kitImport:0,rawButtonString:0,rawInputString:0,rawSelectString:0,rawTextareaString:0,cgxBtn:0},
    qa:{source:'PASS_REQUIRED',phone360:'NOT_EXECUTED',phone390:'NOT_EXECUTED',phone430:'NOT_EXECUTED',tablet768:'NOT_EXECUTED',desktop1366:'NOT_EXECUTED'}
  },
  {
    route:'nutricion',
    module:'fitness/nutrition',
    renderer:'frontend/src/pages/GymManagementPage.jsx',
    status:'MIGRATED',
    canonicalRegions:['single React root','CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgEmptyState','MUI layout/tabs/forms'],
    owners:{pageHeader:'CgPageHeader',actions:'CgButton',forms:'CgTextField + CgSelect + MUI Checkbox',dialogs:'none',data:'React state + MUI Paper/Stack',kpi:'React metrics + CgStatusChip'},
    cssOwners:['frontend/src/styles/erp-runtime.css','frontend/src/styles/module-adapters.css','frontend/src/styles/contagest-visual-system-v12.css'],
    legacyBefore:['shared GymManagementPage imperative renderer','MutationObserver productivity enhancer'],
    legacyBudget:{kitImport:0,rawButtonString:0,rawInputString:0,rawSelectString:0,rawTextareaString:0,cgxBtn:0},
    qa:{source:'PASS_REQUIRED',phone360:'NOT_EXECUTED',phone390:'NOT_EXECUTED',phone430:'NOT_EXECUTED',tablet768:'NOT_EXECUTED',desktop1366:'NOT_EXECUTED'}
  }
]);

export const ERP_UI_WAVE_A_ROUTES=Object.freeze(ERP_UI_WAVE_A_2_51.map((item)=>item.route));
export const ERP_UI_MIGRATION_STATUSES=Object.freeze(['MIGRATED','LEGACY_EXCEPTION_APPROVED','OUT_OF_SCOPE_NON_UI']);
