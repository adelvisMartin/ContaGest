# ContaGest hardening local-first — diseño 2026-09-29

## Estado y baseline

- Repositorio: `adelvisMartin/ContaGest`.
- Baseline de diseño: `main@fa86b361288247ba24e3f633f5895165cd707f1e`.
- Autoridad de trabajo: `AGENTS.md`, código ejecutado, contratos, tests y estado vivo Git/GitHub.
- Backlog coordinador: #624.
- Coordinación temporal entre conversaciones/agentes: #649, hasta que #623 absorba de forma permanente claims/supersession.
- GitHub Actions y Vercel están temporalmente limitados por cuota/plan. Esto es una restricción de infraestructura, no evidencia de calidad ni defecto de código.

## Decisión principal

ContaGest se endurece con un modelo **local-first, exact-SHA y por autoridades únicas**. El desarrollo no queda bloqueado artificialmente por Actions/Vercel cuando la misma propiedad puede demostrarse localmente, pero ninguna verificación remota no ejecutada se presenta como PASS.

El cierre de cada ticket depende de evidencia proporcional a la frontera modificada, no de un único pipeline remoto.

## Objetivos

1. Eliminar autoridades funcionales duplicadas y drift entre código, migrations, PostgreSQL y contratos.
2. Mantener Supabase/PostgreSQL como persistencia canónica; producción sólo cambia mediante migraciones forward-only y runbooks aprobados.
3. Consolidar servicios de dominio para operaciones financieras/irreversibles.
4. Mantener aislamiento multi-tenant en API, services, SQL, constraints, RLS y jobs.
5. Consolidar una autoridad visual común sin forzar el mismo runtime sobre todas las superficies.
6. Reducir duplicación de tests/workflows y permitir verificación rápida desde desarrollo/chat.
7. Producir evidencia exact-SHA reutilizable por PR, CI futuro y release candidate.

## No objetivos

- Reescribir todo el ERP.
- Migrar de Supabase/PostgreSQL a otra base.
- Usar producción como entorno de QA destructiva.
- Crear una tercera implementación Fiscal, UI, Auth o DB.
- Debilitar tests para conseguir verde.
- Convertir `MERGED` en sinónimo de `VERIFIED`.
- Hacer depender cada PR de Firefox/WebKit/soak si el cambio no lo requiere.

## Política de coordinación y no duplicación

Antes de crear issue, branch o PR:

1. refrescar issues y PRs vivos;
2. buscar por responsabilidad, paths y contratos, no sólo por título;
3. identificar el owner funcional existente;
4. complementar el issue owner si el nuevo hallazgo pertenece al mismo problema;
5. crear trabajo nuevo sólo si existe una responsabilidad material distinta;
6. cerrar `duplicate/not_planned` inmediatamente si se descubre un duplicado;
7. registrar issue + branch + candidate SHA como work claim;
8. permitir paralelo sólo en scopes independientes.

La colisión #642/#633 confirma que esta regla debe aplicarse antes de cada nuevo lote.

## Arquitectura objetivo

### Base de datos

Cadena de autoridad:

```text
Prisma schema + migrations/sidecars clasificados
  -> #625 drift inventory
  -> #626 from-zero + upgrades PostgreSQL 17
  -> #632 canonical database gate
  -> #627 production convergence
```

Reglas:

- migrations aplicadas son inmutables;
- correcciones posteriores son forward-only;
- `db push/reset` no se usa en producción;
- PostgreSQL efímero/aislado es obligatorio para QA de persistencia;
- producción se inspecciona read-only hasta el runbook de convergencia;
- objetos Supabase-managed se clasifican y no se tratan como drift de aplicación automáticamente.

### Fiscal

#629 es owner del `Fiscal Single Source of Truth`.

Objetivo:

```text
HTTP/API
  -> fiscal application/domain service
  -> repository authority
  -> PostgreSQL canonical schema
```

Se caracteriza antes de eliminar cualquier implementación. Deben preservarse reglas de vigencia, snapshots históricos, numeración concurrente/idempotente, cierre y tenant isolation. No se retira una garantía de la implementación anterior únicamente para simplificar el código.

### Ledger y finanzas

#628, #637 y #643 se complementan:

- #628: lifecycle posting/reversal/periodos/reconciliación productiva;
- #637: autoridad de domain services para comandos financieros;
- #643: golden dataset y reconciliación transversal.

Arquitectura:

```text
route/controller
  -> application/domain service
  -> repository
  -> PostgreSQL
```

Las routes no son autoridad de reglas financieras. CRUD genérico no puede modificar estados irreversibles. Invariantes: Decimal/rounding, balance, idempotencia, source-effect uniqueness, posted immutability, reversal, period close y tenant isolation.

### Datos, tenant y seguridad

- #633: normalización/constraints/ownership.
- #634: integridad referencial tenant-aware.
- #635: RLS/grants/SECURITY DEFINER.
- #636: frontera Auth/session fail-closed.
- #641: matriz adversarial multi-tenant.
- #651: cierre de findings de seguridad abiertos.

Enforcement se implementa en la capa más fuerte apropiada: constraint/RLS cuando físicamente expresable; domain/service guard cuando dependa de contexto de negocio. Ninguna capa confía en `tenantId`, role o permissions enviados por el cliente.

### Backend/API

- #638 endurece CRUD factory contra `any`, mass-assignment y fields server-owned.
- #652 define autoridad de contratos API.
- #650 define error/correlation/logging seguro.
- #653 registra bounded contexts, owners, adapters y deprecations.

### Frontend/UX

Autoridad progresiva:

```text
semantic tokens (#631)
  -> canonical React/MUI theme
  -> Cg primitives/compositions (#619–#621)
  -> route/domain UI

legacy consumers
  -> compatibility adapter
  -> migration ledger (#639)
```

Control Hípico puede mantener su runtime propio, pero comparte tokens/semántica visual donde corresponde. No se fuerza React sólo para obtener uniformidad.

#645 define theme/state/accessibility contracts y #640 la matriz browser de rutas.

### Infraestructura y operaciones

- #648: containers/edge/runtime dependencies/rootless/headers/SBOM.
- #646: backup/restore DR drill.
- #644: PostgreSQL performance basado en evidencia.
- #654: consolidación de workflows después de establecer runners locales.
- #656: dependency/license governance.
- #665: configuración/env authority.

## Estrategia de verificación local-first

### Evidence dimensions

Cada run/PR usa, según aplicabilidad:

```text
SOURCE_REVIEW
LOCAL_STATIC
LOCAL_UNIT
LOCAL_INTEGRATION
LOCAL_POSTGRES
LOCAL_BUILD
LOCAL_BROWSER_E2E
REMOTE_CI
REMOTE_DEPLOY
PHYSICAL_EXTERNAL
```

Estados permitidos:

```text
PASS | FAIL | BLOCKED | NOT_EXECUTED | NOT_APPLICABLE
```

`REMOTE_CI=BLOCKED_INFRASTRUCTURE` y `REMOTE_DEPLOY=BLOCKED_INFRASTRUCTURE` no invalidan por sí mismos un cambio localmente demostrable, pero tampoco se convierten en PASS.

### Runner

#630 implementa una entrada local canónica por perfiles, reutilizando suites existentes en vez de duplicarlas:

- backend;
- frontend;
- database;
- financial;
- ui;
- full;
- affected/changed cuando el riesgo lo permita.

#655 define ownership de la pirámide de tests y #667 puede mapear cambios a perfiles mínimos.

### PostgreSQL E2E

Para DB/financial/security persistence:

- PostgreSQL 17 real;
- instancia/base aislada por run;
- fixtures propios;
- tenant A/B;
- cleanup aun en fallo/interrupción;
- prohibición de URLs conocidas de dev/prod para tests destructivos;
- migration/schema hash en evidencia;
- concurrency/idempotency cuando aplique.

### Browser E2E

- Chromium local es el gate browser principal de PR/slice afectado.
- #640 mantiene catálogo único de 58 rutas y modos `affected`/`full`.
- Firefox/WebKit se ejecutan cuando el issue es browser-specific, cuando el riesgo lo exige o como matriz ampliada/scheduled cuando haya capacidad.
- no se declara PASS de navegadores no ejecutados.
- no `skip`, `only`, `force`, `waitForTimeout` ni sleeps para estabilizar falsamente.
- tests corren contra build/runtime real y fixtures controlados, no contra una UI desconectada del backend cuando el flujo material requiere persistencia.

### UI contract

Por superficie aplicable:

- loading;
- empty/no-results;
- error/retry;
- success;
- disabled/readOnly;
- permission denied;
- keyboard/focus;
- light/dark/system;
- reduced motion;
- responsive 360/390/430/768/1024/1366/1440 según route class;
- zoom 200%;
- no overlap/clipping/occlusion.

### Refactors

Todo refactor de riesgo usa characterization antes/después. Código sólo se elimina con consumer proof. No se alteran assertions para validar una implementación incorrecta.

## Optimización de velocidad

1. Ejecutar primero gates `affected/changed` derivados de paths/owners.
2. Paralelizar sólo gates independientes.
3. Mantener DB/financial concurrency-sensitive serializados cuando corresponda.
4. Reutilizar cache/build únicamente si está ligado al mismo SHA y configuración.
5. Reservar full PostgreSQL/browser/clean-room para cambios amplios y RC.
6. Mover lógica reusable fuera de YAML; workflows remotos llaman los mismos runners cuando vuelva la cuota.

La velocidad nunca se obtiene desactivando tests o sustituyendo persistencia real por mocks en invariantes financieras/tenant.

## Orden de ejecución recomendado

### Fase 0 — gobierno y bases de verificación

- #97 Fase A: protección estructural de `main` sin required checks remotos indisponibles.
- #649: coordinación de claims mientras conviven conversaciones.
- #629: characterization de autoridad Fiscal.
- #625: drift real repo ↔ producción.
- #626: migration chain from-zero/upgrades.
- #632: canonical database gate.
- #630: local verification runner.

#629/#625 pueden avanzar en paralelo si no mutan las mismas fuentes; #626 depende de entender la autoridad de migrations; #627 no empieza a mutar producción hasta tener evidencia previa.

### Fase 1 — correctness de dominio y producción

- #627 production convergence;
- #628 ledger lifecycle;
- #643 accounting characterization/reconciliation;
- #637 financial domain services;
- #633/#634 constraints y tenant integrity;
- #635 RLS/grants;
- #636 Auth boundary;
- #638 CRUD factory;
- #641 tenant adversarial;
- #651 security findings closure.

### Fase 2 — UI/UX

- #631 token authority;
- #619 component library;
- #620 forms/interactions;
- #621 data-heavy UI;
- #645 theme/state/a11y contract;
- #639 React strangler slices;
- #640 full/affected route matrix.

### Fase 3 — arquitectura/ops

- #622 Clean Code authority/refactor por lotes;
- #653 ADR/ownership map;
- #650 observability;
- #648 container/edge;
- #654 workflow consolidation;
- #655 test ownership;
- #656 dependency governance;
- #657 dead-code/deprecation finalization;
- #658 data lifecycle verification;
- #665 config contract;
- #666 docs integrity.

### Fase 4 — hardening y release

- #644 DB/RLS performance;
- #646 DR drill;
- #659 functional coverage gap audit;
- #663 clean-room verification;
- #664 operational smoke pack;
- #661 backlog reconciliation;
- #662 evidence index;
- #647 exact-SHA RC;
- #660 operator/release handoff.

## Política de cierre de tickets

Un ticket puede quedar `COMPLETED` sin Actions/Vercel cuando:

- implementación real terminada;
- acceptance criteria satisfechos;
- diff revisado;
- pruebas locales materialmente necesarias ejecutadas sobre candidate final;
- DB real/browser/build/security según fronteras tocadas;
- documentación y regresión preventiva incluidas;
- sin secreto/regresión P0/P1 conocida dentro del scope;
- remote/provider state reportado honestamente.

Un ticket queda `BLOCKED` si falta evidencia exclusivamente disponible en proveedor/entorno físico y esa evidencia es material para su criterio funcional. No se usa un bloqueo externo para encubrir fallo de código.

## Release readiness

#647 sólo puede declarar `RELEASE_READY` si el candidate exacto tiene evidencia suficiente en DB, financial, tenant/security, build, browser y recovery; los provider-specific blockers se muestran como dimensiones separadas. `REMOTE_DEPLOY` bloqueado significa que el deploy no fue verificado, incluso si el código es release-candidate localmente.

## Riesgos principales

- dos chats/agentes implementando el mismo owner;
- convertir tests históricos en segunda autoridad;
- modificar migrations ya desplegadas;
- perder idempotencia Fiscal/ledger durante simplificación;
- sobre-normalizar o sobre-abstraer;
- convertir UI en autoridad de permisos/finanzas;
- eliminar legacy antes de consumer proof;
- confundir quota failure con code failure;
- full suites demasiado lentas y por ello ignoradas.

## Controles preventivos

- work claims/dedup;
- authority manifests;
- migration immutability;
- exact-SHA evidence;
- PostgreSQL ephemeral fixtures;
- characterization tests;
- two-tenant adversarial tests;
- component/token ownership gates;
- deprecation ledger;
- evidence index;
- clean-room RC.

## Criterio de aprobación de este diseño

Con la aprobación de este documento, el siguiente paso es producir un plan de implementación ejecutable por tickets/PRs. El primer lote recomendado es `#629 + #625` para characterization/inventario, seguido de `#626/#632`, con `#630` como infraestructura de verificación en paralelo sólo cuando no invada los archivos/owners de dominio.
