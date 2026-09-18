# UI Migration Governance — 2/51

Baseline de esta implementación: `main@89286ce65e2466873463bcd5518e1dc820e2633b`.

## Decisión

Las superficies verticales auditadas no pueden quedar en un estado implícito entre el kit HTML histórico y el stack React/MUI.

La autoridad machine-readable vive en:

- `qa/support/ui-migration-manifest.mjs`
- `qa/support/ui-migration-audit.mjs`
- `scripts/ui-migration-audit.mjs`

`npm run audit:visual:strict` consume el mismo contrato y falla cerrado ante drift.

## Estado gobernado

- `veterinaria`: **MIGRATED_MUI**. El route registry monta `VeterinaryClinicPageV1123.jsx`, que compone únicamente superficies React/MUI gobernadas por `createContaGestMuiTheme()`. No puede importar `components/ui/index.js`, `designSystem.js` ni volver a una composición denominada legacy sin romper el gate.
- `odontologia`: **LEGACY_EXCEPTION_APPROVED**. Owner: ContaGest Frontend. Aprobada: 2026-09-17. Follow-up: migración behavior-preserving a Cg*/MUI. Mientras exista la excepción debe conservar los contratos responsive `.cg-dental-treatment-form` y `.cg-dental-tooth-grid` bajo media queries max-width.
- `gimnasio`, `rutinas`, `nutricion`: **LEGACY_EXCEPTION_APPROVED** porque comparten `GymManagementPage.js`. Owner: ContaGest Frontend. Aprobada: 2026-09-17. El follow-up es migrar la superficie compartida a Cg*/MUI sin alterar membresías, check-in, evaluaciones, rutinas ni nutrición. La excepción exige cobertura responsive para `.cg-gym-v1124-fields` y `.cg-gym-v1124-list`.

## Invariantes

1. El manifest debe corresponder exactamente con `PAGE_REGISTRY`.
2. Una superficie `MIGRATED_MUI` debe mantener imports MUI/theme canónicos y no puede reintroducir el kit legacy.
3. Una excepción legacy exige owner, fecha, follow-up y responsive markers verificables en página y CSS.
4. Cambiar la página registrada sin actualizar deliberadamente el manifest falla.
5. El audit produce `artifacts/qa/ui-migration-audit.json`.
6. SOURCE PASS no equivale a BROWSER PASS; Playwright sigue siendo la autoridad para render/interaction real.

## Fuera de alcance de 2/51

- reescribir Odontología o Gimnasio completos en la misma implementación;
- cambiar APIs, persistencia, RBAC o contratos clínicos;
- alterar workflows de membresía, rutinas o nutrición;
- declarar browser/E2E PASS sin ejecución real.
