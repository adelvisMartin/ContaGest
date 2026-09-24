# Auditoría técnica · Implementaciones 1–58

Fecha de revisión: 2026-09-24  
Fuente de verdad: `config/implementation-roadmap-1-58.json`, PRs mergeados, código actual, contratos y CI exact-SHA.

## Reglas

- Un PR cerrado/superseded no vuelve a ser autoridad.
- Un refactor debe preservar rutas públicas, autenticación, tenant isolation, persistencia y respuesta.
- `IMPLEMENTED` no equivale a `VERIFIED`.
- Desde que GitHub Actions volvió a asignar runners, cualquier rojo con steps/logs reales se trata como defecto concreto y no como #134.
- Ningún cambio se declara DONE hasta que el SHA final ejecute sus gates requeridos.

## Hallazgos transversales

1. **God files backend**: `health.routes.ts`, `veterinary.routes.ts` y `gym.routes.ts` concentran muchas responsabilidades. Batch 1 ya centralizó helpers/progresión; PR #508 extrae schemas Gym/Veterinary sin mover persistencia/autorización.
2. **MUI 9**: la actualización a `@mui/material@9.4.0` eliminó APIs legacy de TextField y system props. 59/75 está normalizando el boundary canónico Cg* y los fallos browser se corrigen por evidencia, no mediante waivers artificiales.
3. **QA visual/a11y**: el gate 49 confundía descendants de Tabs scrollables con overflow y simulaba zoom mediante CSS, lo que no recalculaba breakpoints. El candidate 59/75 usa scroll-container semantics y viewport reflow proxy.
4. **CI**: #134 dejó de ser un bloqueo pre-runner en las ejecuciones actuales. PostgreSQL, seguridad, IAM y varios gates ya han producido steps/logs reales; los gates restantes deben corregirse uno por uno.
5. **Supersession**: las implementaciones 13, 15, 16, 17, 18, 22, 23, 26, 34, 43, 49, 50, 55 y 58 tuvieron follow-ups o ramas concurrentes. La matriz canónica conserva sólo la autoridad vigente.

## Matriz 1–58

| ID | Implementación | PR(s) autoridad | Revisión | Estado/hallazgo actual |
| ---: | --- | --- | --- | --- |
| 1 | Baseline técnico / Hípico contracts | #376 | BASELINE_RECONCILED | Infra/QA: runners volvieron a ejecutar steps; ya no clasificar rojos actuales como bloqueo pre-runner. |
| 2 | QA browser 58×5 sharded | #429 | BASELINE_RECONCILED | Infra/QA: runners volvieron a ejecutar steps; ya no clasificar rojos actuales como bloqueo pre-runner. |
| 3 | Migración verticales Wave A a React Cg/MUI | #390, #392, #396 | BASELINE_RECONCILED | UI React migrada. MUI 9 eliminó system props/legacy TextField props; compatibilidad se corrige incrementalmente con evidencia browser. |
| 4 | Inventario React Cg/MUI | #398 | BASELINE_RECONCILED | UI React migrada. MUI 9 eliminó system props/legacy TextField props; compatibilidad se corrige incrementalmente con evidencia browser. |
| 5 | Ventas React Cg/MUI | #399 | BASELINE_RECONCILED | UI React migrada. MUI 9 eliminó system props/legacy TextField props; compatibilidad se corrige incrementalmente con evidencia browser. |
| 6 | Compras y cuentas por pagar React Cg/MUI | #401 | BASELINE_RECONCILED | UI React migrada. MUI 9 eliminó system props/legacy TextField props; compatibilidad se corrige incrementalmente con evidencia browser. |
| 7 | Tesorería y conciliación React Cg/MUI | #402 | BASELINE_RECONCILED | UI React migrada. MUI 9 eliminó system props/legacy TextField props; compatibilidad se corrige incrementalmente con evidencia browser. |
| 8 | Libro diario React Cg/MUI | #405 | BASELINE_RECONCILED | UI React migrada. MUI 9 eliminó system props/legacy TextField props; compatibilidad se corrige incrementalmente con evidencia browser. |
| 9 | Impuestos React Cg/MUI | #407 | BASELINE_RECONCILED | UI React migrada. MUI 9 eliminó system props/legacy TextField props; compatibilidad se corrige incrementalmente con evidencia browser. |
| 10 | Paciente seleccionado como contexto clínico dental | #409 | BASELINE_RECONCILED | Dominio dental preservado. WCAG actual aún reporta fallos en odontología; revisar por finding real antes de tocar lógica clínica. |
| 11 | Odontograma estructurado persistente | #412 | BASELINE_RECONCILED | Dominio dental preservado. WCAG actual aún reporta fallos en odontología; revisar por finding real antes de tocar lógica clínica. |
| 12 | Selector visual de superficies dentales | #416 | BASELINE_RECONCILED | Dominio dental preservado. WCAG actual aún reporta fallos en odontología; revisar por finding real antes de tocar lógica clínica. |
| 13 | Historial y enmiendas versionadas de odontograma | #418 | BASELINE_RECONCILED | Dominio dental preservado. WCAG actual aún reporta fallos en odontología; revisar por finding real antes de tocar lógica clínica. |
| 14 | Periodontograma estructurado y evolución | #420 | BASELINE_RECONCILED | Dominio dental preservado. WCAG actual aún reporta fallos en odontología; revisar por finding real antes de tocar lógica clínica. |
| 15 | Planes de tratamiento con owner único | #422, #423, #424, #426 | BASELINE_RECONCILED | Dominio dental preservado. WCAG actual aún reporta fallos en odontología; revisar por finding real antes de tocar lógica clínica. |
| 16 | Consentimiento versionado y lifecycle | #425 | BASELINE_RECONCILED | Dominio dental preservado. WCAG actual aún reporta fallos en odontología; revisar por finding real antes de tocar lógica clínica. |
| 17 | Media y documentos clínicos aislados | #430, #431 | BASELINE_RECONCILED | Dominio dental preservado. WCAG actual aún reporta fallos en odontología; revisar por finding real antes de tocar lógica clínica. |
| 18 | Lifecycle clínico dental explícito | #434, #437 | BASELINE_RECONCILED | Dominio dental preservado. WCAG actual aún reporta fallos en odontología; revisar por finding real antes de tocar lógica clínica. |
| 19 | Agenda dental avanzada conflict-safe | #440 | BASELINE_RECONCILED | Dominio dental preservado. WCAG actual aún reporta fallos en odontología; revisar por finding real antes de tocar lógica clínica. |
| 20 | Integración financiera dental con ERP | #445 | BASELINE_RECONCILED | Dominio dental preservado. WCAG actual aún reporta fallos en odontología; revisar por finding real antes de tocar lógica clínica. |
| 21 | Veterinaria renderer/root único | #448 | BASELINE_RECONCILED | Veterinaria preservada. Detectados falsos positivos en tabs scrollables/zoom del gate 49 y deuda de schemas; schema extraction está en PR #508. |
| 22 | Errores veterinarios visibles y retryable | #449, #458, #465 | BASELINE_RECONCILED | Veterinaria preservada. Detectados falsos positivos en tabs scrollables/zoom del gate 49 y deuda de schemas; schema extraction está en PR #508. |
| 23 | Historia longitudinal y tendencias de signos vitales | #450, #460, #468 | BASELINE_RECONCILED | Veterinaria preservada. Detectados falsos positivos en tabs scrollables/zoom del gate 49 y deuda de schemas; schema extraction está en PR #508. |
| 24 | Cuidados preventivos y recordatorios | #451 | BASELINE_RECONCILED | Veterinaria preservada. Detectados falsos positivos en tabs scrollables/zoom del gate 49 y deuda de schemas; schema extraction está en PR #508. |
| 25 | Templates SOAP editables por especie | #452 | BASELINE_RECONCILED | Veterinaria preservada. Detectados falsos positivos en tabs scrollables/zoom del gate 49 y deuda de schemas; schema extraction está en PR #508. |
| 26 | Lifecycle de laboratorio veterinario | #453, #454 | CLEAN_CODE_BATCH_1 | Veterinaria preservada. Detectados falsos positivos en tabs scrollables/zoom del gate 49 y deuda de schemas; schema extraction está en PR #508. |
| 27 | Hoja de tratamiento append-only | #455 | CLEAN_CODE_BATCH_1 | Veterinaria preservada. Detectados falsos positivos en tabs scrollables/zoom del gate 49 y deuda de schemas; schema extraction está en PR #508. |
| 28 | Prescripciones veterinarias y etiquetas | #456 | CLEAN_CODE_BATCH_1 | Veterinaria preservada. Detectados falsos positivos en tabs scrollables/zoom del gate 49 y deuda de schemas; schema extraction está en PR #508. |
| 29 | Inventario clínico veterinario por lotes | #457 | CLEAN_CODE_BATCH_1 | Veterinaria preservada. Detectados falsos positivos en tabs scrollables/zoom del gate 49 y deuda de schemas; schema extraction está en PR #508. |
| 30 | Flujo financiero veterinario estimate→invoice | #462 | CLEAN_CODE_BATCH_1 | Veterinaria preservada. Detectados falsos positivos en tabs scrollables/zoom del gate 49 y deuda de schemas; schema extraction está en PR #508. |
| 31 | Portal autorizado de tutor | #463 | CLEAN_CODE_BATCH_1 | Veterinaria preservada. Detectados falsos positivos en tabs scrollables/zoom del gate 49 y deuda de schemas; schema extraction está en PR #508. |
| 32 | Gestión opcional de boarding | #464 | CLEAN_CODE_BATCH_1 | Veterinaria preservada. Detectados falsos positivos en tabs scrollables/zoom del gate 49 y deuda de schemas; schema extraction está en PR #508. |
| 33 | Constructor estructurado de rutinas | #467 | BASELINE_RECONCILED | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 34 | Biblioteca tenant-scoped de ejercicios | #469, #471 | BASELINE_RECONCILED | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 35 | Programación semanal real | #470 | BASELINE_RECONCILED | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 36 | Modos explícitos de entrenamiento | #472 | BASELINE_RECONCILED | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 37 | Técnicas estructuradas de intensidad | #473 | CLEAN_CODE_BATCH_1 | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 38 | Motor determinista de progresión | #474 | CLEAN_CODE_BATCH_1 | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 39 | Periodización inmutable | #475 | CLEAN_CODE_BATCH_1 | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 40 | Ejecución sesión por sesión | #476 | CLEAN_CODE_BATCH_1 | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 41 | Analítica histórica de rendimiento | #477 | BASELINE_RECONCILED | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 42 | Sustituciones contextuales seguras | #478 | BASELINE_RECONCILED | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 43 | Modelo canónico de ingredientes | #479 | BASELINE_RECONCILED | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 44 | Plan alimenticio multi-semana completo | #481 | BASELINE_RECONCILED | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 45 | Restricciones y preferencias nutricionales explícitas | #482 | BASELINE_RECONCILED | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 46 | Snapshots inmutables de composición nutricional | #483 | BASELINE_RECONCILED | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 47 | Adherencia y evolución integradas | #484 | BASELINE_RECONCILED | Gimnasio preservado. Gimnasio/Rutinas pasan WCAG en el SHA previo de 59; Nutrición aún requiere corrección. Schema extraction está en PR #508. |
| 48 | E2E PostgreSQL real de tres verticales | #485 | BASELINE_RECONCILED | VERIFIED en SHA previo de 59/75: PostgreSQL real de tres verticales terminó PASS; debe repetirse sobre el SHA final. |
| 49 | Matriz visual anti-solapamiento consolidada | #489 | BASELINE_RECONCILED | Gate visual corregido en 59/75 para distinguir scroll intencional y usar reflow proxy de zoom; exact-SHA actual pendiente. |
| 50 | Contratos de componentes reutilizables | #490 | BASELINE_RECONCILED | CgTextField/CgPageHeader adaptados a MUI 9 slotProps/sx en 59/75; exact-SHA actual pendiente. |
| 51 | Release candidate demostrable exact-SHA | #491 | BASELINE_RECONCILED | Release candidate exact-SHA activo; no cerrar hasta Source/PostgreSQL/Chromium/WCAG/compatibilidad verdes en el mismo SHA. |
| 52 | Entitlements verticales canónicos | #492 | BASELINE_RECONCILED | Access/licensing server-authoritative preservado; IAM fue PASS en SHA previo de 59/75 y debe repetirse tras los últimos commits. |
| 53 | Single Access Manifest | #493 | BASELINE_RECONCILED | Access/licensing server-authoritative preservado; IAM fue PASS en SHA previo de 59/75 y debe repetirse tras los últimos commits. |
| 54 | Permisos de roles derivados del manifiesto | #494 | BASELINE_RECONCILED | Access/licensing server-authoritative preservado; IAM fue PASS en SHA previo de 59/75 y debe repetirse tras los últimos commits. |
| 55 | Validación runtime del manifiesto y provisioning atómico | #495, #496 | BASELINE_RECONCILED | Access/licensing server-authoritative preservado; IAM fue PASS en SHA previo de 59/75 y debe repetirse tras los últimos commits. |
| 56 | Módulos/licencias canónicos | #497 | BASELINE_RECONCILED | Access/licensing server-authoritative preservado; IAM fue PASS en SHA previo de 59/75 y debe repetirse tras los últimos commits. |
| 57 | Landing/navegación vertical server-authoritative | #498 | BASELINE_RECONCILED | Access/licensing server-authoritative preservado; IAM fue PASS en SHA previo de 59/75 y debe repetirse tras los últimos commits. |
| 58 | Browser→API→PostgreSQL E2E real | #500 | BASELINE_RECONCILED | Browser→API→PostgreSQL real permanece autoridad #500; revalidación exact-SHA final sigue requerida. |

## Lotes de refactor

### Integrado · Clean Code batch 1

IDs: **26–32 y 37–40**.

- reutiliza helpers compartidos veterinarios;
- centraliza validación de progresión;
- conserva endpoints y persistencia;
- no restaura PRs superseded.

### Pendiente de integración · Clean Code batch 2

PR **#508**.

- extrae `gym.schemas.ts`;
- extrae `veterinary.schemas.ts`;
- mantiene autorización/persistencia en route modules;
- sus tres regresiones dedicadas ya ejecutaron PASS en su SHA, pero el PR está detrás de `main` y debe reconstruirse tras cerrar 59/75.

### Recovery/release · 59/75

PR **#503** es la autoridad actual.

El SHA final debe demostrar, como mínimo:

- authoritative contracts;
- typecheck/build;
- security/AppSec;
- PostgreSQL real;
- 48/51 real vertical E2E;
- 49/51 visual;
- 50/51 reusable component contracts;
- WCAG/contrast;
- Chromium y compatibilidad requerida;
- identidad exacta del candidate.

## Follow-ups priorizados

**P0**: cerrar 59/75 con todos los required gates del mismo SHA.  
**P0**: mantener #134 abierto hasta que el orquestador pueda verificar CI + PostgreSQL sobre `main` con runner/steps/logs.  
**P1**: reconstruir/mergear #508 sobre el `main` final de 59/75.  
**P1**: continuar separación de `health.routes.ts` por subdominio sin cambiar rutas públicas.  
**P1**: completar migración MUI 9 de system props en las superficies que sigan generando warnings/fallos.  
**P1**: corregir WCAG/visual por findings concretos restantes (no waivers globales).  
**P2**: extraer clientes de `verticalService.js` por vertical cuando los contracts de API estén estabilizados.

## Criterio de cierre

La auditoría 1–58 es un inventario vivo. Un item puede estar implementado y seguir requiriendo hardening. Las columnas de esta tabla describen el estado actual, no sustituyen la evidencia exact-SHA de CI.
