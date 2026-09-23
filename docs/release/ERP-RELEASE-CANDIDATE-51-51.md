# 51/51 · Release Candidate demostrable por SHA

## Objetivo

Cerrar la hoja de ruta con un candidate reproducible y auditable, no con una afirmación manual de “todo verde”.

La autoridad automatizada es .github/workflows/release-candidate-v5151.yml.

La rama release/candidate-* existe para congelar un SHA candidato y ejecutar evidencia sobre ese mismo commit.

## Gates obligatorios

### 1. Source / build / security

Sobre el SHA exacto:

- npm ci --no-audit --no-fund;
- Prisma validate;
- typecheck;
- lint/source contracts;
- test suite;
- frontend + backend build;
- bundle budget;
- npm audit --omit=dev --audit-level=high.

Ninguno se ejecuta con continue-on-error.

### 2. PostgreSQL real

Reutiliza el trabajo 48/51: PostgreSQL 17 efímero, prerequisitos Supabase mínimos, migraciones canónicas, seed normal, JWT/RBAC reales, ALLOW_DEV_TENANT_HEADER=false, SUPABASE_AUTH_FALLBACK=false, E2E real Odontología + Veterinaria + Gimnasio y cleanup fail-closed.

### 3. Chromium

Ejecuta test:browser:58:core, que ya contiene Wave A, 49/51 anti-overlap, 50/51 reusable components, smoke de rutas, controles, navegación móvil y acciones observables.

### 4. WCAG

Ejecuta WCAG 2.2 automatizado y contraste.

### 5. Compatibilidad

Firefox y WebKit ejecutan las autoridades canónicas de 49/51 y 50/51.

## Exact-SHA

Cada job compara git rev-parse HEAD contra CANDIDATE_SHA. Los artifacts incluyen el SHA en el nombre. Evidencia de otro commit no demuestra este candidate.

## Veredicto

El job Release truth gate exige success de todos los gates automatizados.

Vocabulario: PASS = ejecutó sobre el SHA y pasó; FAIL = ejecutó y falló; BLOCKED = infraestructura/prerrequisito impidió ejecutar; NOT_EXECUTED = no existe ejecución.

Un job pre-runner de #134 no es PASS.

## Vercel y producción

Vercel queda deliberadamente separado del gate automatizado del candidate. El artifact final inicializa vercel=NOT_EXECUTED y exige para sign-off de despliegue: GitHub main SHA == deployment source SHA == /api/health buildCommit.

Un candidate automatizado PASS no equivale por sí solo a producción verificada. Vercel READY o HTTP 200 tampoco sustituyen browser/E2E.

## Rollback

51/51 agrega infraestructura QA/release y no cambia schema ni datos de negocio. Rollback del gate: revertir el merge 51/51. Para candidates de producto posteriores se usa el commit anterior conocido y la estrategia de migración correspondiente.

## Estado inicial

Al crear el workflow: NOT_EXECUTED. Sólo se reportará DONE cuando exista ejecución real suficiente del SHA final; si Actions termina antes del runner, el estado es BLOCKED_INFRASTRUCTURE #134.
