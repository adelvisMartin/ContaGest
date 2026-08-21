# ContaGest baseline audit

Fecha de ejecución: 2026-08-20
Rama de trabajo: `feat/production-readiness-ui-qa`
Commit inicial recibido: `9447b98` (`chore: capture ContaGest starting state`)
Runtime: Node `v22.14.0`, npm `10.9.2`

## Alcance y método

El árbol recibido no contenía `.git`; se creó un repositorio local y un commit inicial para poder trabajar en una rama dedicada. No se configuró remoto, no se hizo push y no se hizo merge.

Se inspeccionaron los package managers raíz/frontend/backend, scripts oficiales, estructura de API, Prisma/migraciones, rutas frontend, componentes compartidos, estilos, PWA, tests, QA browser, CI, Vercel y skills del proyecto. El archivo de misión pegado en el chat se trató como plan de trabajo, no como un script ejecutable por el sistema.

## Resultado inicial antes de cambios

| Check | Comando | Resultado | Evidencia |
|---|---|---|---|
| Instalación limpia | `npm ci` | PASS con advertencias | 497 paquetes instalados; 5 vulnerabilidades: 2 moderate, 3 high |
| Build | `npm run build` | FAIL preexistente | `backend/src/app.ts:66`: `IncomingMessage.originalUrl` no existe en el tipo inferido |
| Typecheck | `npm run typecheck` | FAIL preexistente | Mismo error de `backend/src/app.ts:66` |
| Lint/contratos Node | `npm run lint` | FAIL preexistente | Typecheck se detiene antes de ejecutar los tests de este script |
| Tests | `npm test` | FAIL preexistente | 194 tests: 170 PASS, 24 FAIL |
| Auditoría producción | `npm run audit:prod` | FAIL | Vulnerabilidades en `deepmerge-ts` vía Prisma y `uuid` vía ExcelJS; la solución sugerida exige cambios breaking |
| Bundle budget, ejecución paralela inicial | `npm run check:bundle` | NOT EXECUTED correctamente | Corrió antes de terminar el build y no existía `frontend/dist/assets` |
| Bundle budget, repetido después del build | `npm run check:bundle` | PASS | 87 chunks; máximo 506.6 KiB; total 1.83 MiB |
| Skills lock | `npm run skills:check` | PASS | 5 fuentes pinned validadas; vendor cache no materializado |

## Fallos de tests encontrados

Los siguientes fallos ya estaban presentes en el commit inicial y se clasifican como deuda/regresión preexistente, no como regresión de esta rama:

- `tests/hipico_group_bridge_contract.test.mjs`: el route no contiene el contrato textual `targetType: 'group_bridge'`.
- `tests/hipico_v1130_product_contract.test.mjs`: la migración Hipico contiene referencias que el contrato considera tablas Fitness.
- `tests/phase3_shell_psychology_i18n.test.mjs`: shell y catálogo de temas no coinciden con los contratos phase 3.
- `tests/phase4_mobile_polish_manifest.test.mjs`: contratos de CSS, marca móvil, WhatsApp, RIF y señales de gimnasio no coinciden con el código actual.
- `tests/v11_10_veterinary.test.mjs`: la capa compacta se encuentra centralizada como shim y no conserva el contenido textual esperado en el entrypoint antiguo.
- `tests/v11_11_enterprise_hardening.test.mjs`: el contrato de controles CAPTCHA, URL/RBAC, demo y CSS responsive no coincide con la implementación actual.
- `tests/v11_14_mobile_access_security.test.mjs`: fallos en throttle CAPTCHA, control frontend de admin, demos y CSS responsive.
- `tests/v11_15_legal_frontend.test.mjs`: falta el marcado esperado para bloquear visualmente el RIF.
- `tests/v11_23_modernization.test.mjs`: el service worker Hipico no cumple el contrato de versionado/sensibles.
- `tests/v11_23_qa_license.test.mjs`: el guard de sesión no contiene todos los invariantes del contrato QA.
- `tests/v11_24_mobile_verticals_hipico.test.mjs`: el enrutamiento mobile y el service worker Hipico no cumplen el contrato vigente.
- `tests/v11_25_productivity_and_parity.test.mjs`: faltan señales del formulario demo.
- `tests/v11_26_shell_access_fooddata.test.mjs`: el contrato espera invariantes de acceso que no aparecen en los archivos actuales.
- `tests/v11_9_1_auth.test.mjs`: los archivos raíz de estilos de login son shims y no exponen los selectores textuales que el test todavía exige.

No se declarará QA completo hasta volver a ejecutar los casos afectados y separar contratos obsoletos de defectos funcionales reales.

## Corrección aplicada después del baseline

Se corrigió únicamente el tipado de `express.json({ verify })` en `backend/src/app.ts`, usando el tipo `Request` de Express y el fallback `req.url`. No cambia la captura de `rawBody`, el alcance de la ruta ni el orden de middleware.

Después de esa corrección:

- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm run check:bundle`: PASS al ejecutarse después del build.

Los 24 fallos de contrato y las vulnerabilidades de dependencias siguen abiertos y requieren fases separadas, revisión de intención y pruebas de regresión.

## Progreso posterior al baseline

Se ejecutaron correcciones acotadas y se repitieron los contratos afectados:

- `tests/hipico_group_bridge_contract.test.mjs`: PASS, 4/4.
- `tests/hipico_v1130_product_contract.test.mjs`: PASS, 7/7.
- `tests/phase4_mobile_polish_manifest.test.mjs`: el contrato de señales Gym pasó; permanecen contratos históricos de logo/WhatsApp/CSS.
- `npm test`: 182/194 PASS después de los cambios; quedan 12 fallos de contratos históricos o de compatibilidad pendientes de decisión.
- Se agregó la señal operativa `Coaching y retención` en Gimnasio y se protegió el KPI monetario contra división de valores.
- Se corrigió el detector de secretos para reducir falsos positivos sin relajar la detección de accesos frontend a secretos server-only.

## Riesgos de producción iniciales

1. La suite de regresión no está verde: 24 contratos fallan.
2. La auditoría de dependencias reporta 3 vulnerabilidades high y 2 moderate.
3. El bundle tiene un vendor MUI de 506.6 KiB, aunque el presupuesto actual lo aprueba.
4. La arquitectura contiene varios shims de estilos legacy; hay riesgo de que contratos históricos y runtime real diverjan.
5. No se ejecutó todavía browser QA real ni una matriz completa por módulos, responsive, RBAC y tenant isolation.

Estado inicial: **BLOCKED para producción; continuar auditoría y correcciones en la rama dedicada**.
