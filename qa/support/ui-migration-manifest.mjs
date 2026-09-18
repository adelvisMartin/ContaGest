export const UI_MIGRATION_STATUS=Object.freeze({
  MIGRATED_MUI:'MIGRATED_MUI',
  LEGACY_EXCEPTION_APPROVED:'LEGACY_EXCEPTION_APPROVED'
});

const legacyException=(config)=>Object.freeze({
  status:UI_MIGRATION_STATUS.LEGACY_EXCEPTION_APPROVED,
  owner:'ContaGest Frontend',
  approvedAt:'2026-09-17',
  compatibilityImport:'../components/ui/index.js',
  ...config,
  responsiveMarkers:Object.freeze([...(config.responsiveMarkers||[])])
});

export const UI_MIGRATION_MANIFEST=Object.freeze({
  veterinaria:Object.freeze({
    status:UI_MIGRATION_STATUS.MIGRATED_MUI,
    owner:'ContaGest Frontend',
    migratedAt:'2026-09-17',
    registryFile:'VeterinaryClinicPageV1123.jsx',
    exportName:'VeterinaryClinicPage',
    framework:'mui',
    sourceFiles:Object.freeze(['VeterinaryClinicPageV1123.jsx','VeterinaryClinicPage.jsx']),
    requiredImports:Object.freeze(['@mui/material','../components/muiRuntime.js']),
    forbiddenImports:Object.freeze(['../components/ui/index.js','../components/designSystem.js']),
    forbiddenTokens:Object.freeze(['VeterinaryClinicLegacy'])
  }),
  odontologia:legacyException({
    registryFile:'DentistryPracticePage.js',
    exportName:'DentistryPracticePage',
    followUp:'Migrate DentistryPracticePage.js to Cg*/MUI in a dedicated behavior-preserving UI migration.',
    responsiveMarkers:['.cg-dental-treatment-form','.cg-dental-tooth-grid']
  }),
  gimnasio:legacyException({
    registryFile:'GymManagementPage.js',
    exportName:'GymManagementPage',
    followUp:'Migrate GymManagementPage.js to Cg*/MUI without changing memberships, routines, nutrition or check-in flows.',
    responsiveMarkers:['.cg-gym-v1124-fields','.cg-gym-v1124-list']
  }),
  rutinas:legacyException({
    registryFile:'GymManagementPage.js',
    exportName:'GymManagementPage',
    followUp:'Migrate the shared GymManagementPage.js surface to Cg*/MUI while preserving the Rutinas route contract.',
    responsiveMarkers:['.cg-gym-v1124-fields','.cg-gym-v1124-list']
  }),
  nutricion:legacyException({
    registryFile:'GymManagementPage.js',
    exportName:'GymManagementPage',
    followUp:'Migrate the shared GymManagementPage.js surface to Cg*/MUI while preserving nutrition-plan behavior.',
    responsiveMarkers:['.cg-gym-v1124-fields','.cg-gym-v1124-list']
  })
});

export const UI_MIGRATION_ROUTES=Object.freeze(Object.keys(UI_MIGRATION_MANIFEST));
