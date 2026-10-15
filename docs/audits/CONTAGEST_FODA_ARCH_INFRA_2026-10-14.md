# ContaGest · FODA y auditoría acotada de arquitectura / infraestructura
**Fecha:** 2026-10-14. **Source baseline:** `main@83b62082677f41777b7c586e75b1ae7d95c9d7a0`. **Auditoría:** source, configuración, docs e issues GitHub. **No** es auditoría runtime, DB productiva, QA física o pentest.

## Arquitectura observada en repositorio
- Monorepo npm Workspaces (`package.json`, `package-lock.json`) y Node 22; frontend React/Vite (`frontend/package.json`), backend Express/TypeScript/Prisma (`backend/package.json`), PostgreSQL/Supabase (`backend/prisma/`, `supabase/`).
- Autoridad de dominios declarada: platform, financial, commercial, operations, vertical (`docs/ARCHITECTURE_BOUNDARIES_V1.md`, `AGENTS.md`). Arquitectura esperada: UI/evento → API/validación → servicio → persistencia → respuesta/UI; comprobar ejecución para certificar, no inferir de carpetas.
- `frontend/src/data/pageRegistry.js` y `qa/support/module-visual-catalog.mjs`: **60 entradas canónicas cada uno** en inspección estática, con `sedes`. `AGENTS.md` y `docs/ARCHITECTURE_BOUNDARIES_V1.md` todavía hablan de 58: documento/matriz desactualizados; recontar con gate real.
- `.agents/skills/`: 20 directorios preexistentes; `.agents/agents/`: 8 perfiles; 5 capacidades en `.agents/execution-skills/`. Agent System v3 (`config/agent-system-v3.json`) impone 2–4 skills de dominio, evidencia exact-SHA y neutralización de externos.
- `.github/workflows/pr-quality-gate-v1.yml` define static/contracts/build, Postgres 16 efímero, Playwright Chromium, PWA/security y gate final fail-closed. Existencia de pipeline **no equivale** a una ejecución exitosa del SHA actual.
- `vercel.json`: `git.deploymentEnabled=false` y `ignoreCommand=exit 1`, señal de despliegue git no habilitado en esa configuración; verificar qué plataforma realmente sirve el release. `render.yaml` declara servicio backend free e instalación `npm install --include=dev`; proponer evaluación de instalación reproducible vs `npm ci`, con prueba de build.

## FODA (hipótesis técnicas con evidencia)
| Dimensión | Evidencia observada | Impacto / oportunidad |
|---|---|---|
| **F — Fortalezas** | Dominios explícitos, Prisma/PG, controles tenant/RBAC documentados; contrato de agentes v3; suite amplia `tests/` y `qa/` | Base apta para evolución incremental sin rediseñar |
| **F** | Outbox y Hípico con boundaries documentados en `README.md`; Playwright/CI multi-gate | Posibilidad de demostrar flujos end-to-end con gates |
| **O — Oportunidades** | `#853` propone autoridad común de trabajos/outbox; `#848/#849/#852/#854` servicios compartidos | Evitar lógica duplicada por vertical, instrumentar contratos transaccionales |
| **O** | Skills Ponytail/Addy curadas en #974, auditorías existentes `scripts/architecture-boundary-audit.mjs` | Mejorar tamaño de diffs, revisión, trazabilidad y coordinación en cuatro ventanas |
| **D — Debilidades** | `#651` cierre de seguridad aún abierto; `#665` contrato configuración y `#664` smoke operativo aún abiertos | Security/config/runtime readiness no demostrados totalmente |
| **D** | Conteo 60/60 frente a documentación 58; `docs/QA_FODA_SYSTEM_AUDIT_2026-08-15.md` histórico | Riesgo de gates/reportes obsoletos si asumen inventario fijo |
| **D** | `#669` go/no-go y `#841` META final abiertos | No hay evidencia suficiente para declaración de 100%/producción |
| **A — Amenazas** | Límites históricos GitHub Actions/Vercel descritos en `#624`; config Vercel sin despliegue Git | Release con evidencia parcial o SHA distinto; requiere verificación local-first y veredicto separado |
| **A** | `#119/#120` física/soak de Hípico siguen abiertos; SOURCE restringido según `#837` | Regresiones físicas, indisponibilidad o riesgo de mensajería real |
| **A** | Cuatro ventanas editando mismo scope o mergeando simultáneamente | Conflictos, pérdida de cambios y CI obsoleta; aplicar coordinador serial |

## Riesgos y prioridades (hallazgo != fallo confirmado)
| Prioridad | Hallazgo / ticket propietario | Acción y evidencia que falta |
|---|---|---|
| P0 | #669 / #841 / #840 release | Matriz exact-SHA local/E2E/infra y smoke post-deploy real antes de PRODUCTION_VERIFIED |
| P0 | #119 / #120 / #837 Hípico | QA físico Android/PWA/LAB y soak 24–72 h con evidencia; SOURCE read-only |
| P1 | #651 / #720 seguridad, RLS, IAM | Negativos A↔B, roles/secret leakage/media y SQL real efímero; no cerrar umbrella hasta children |
| P1 | #853 jobs/outbox | Revisar duplicidad y formalizar transactional enqueue, leases, retry, DLQ, idempotencia, observabilidad |
| P1 | #836 clean code/architecture | Ejecutar `npm run audit:architecture`, `audit:functions:strict`, `audit:visual:strict`, caracterizar dependencias antes de refactor |
| P1 | Documentación 58 vs 60 | Reconciliar autoridades de inventario y tests dependientes del número fijo; crear issue específico sólo si la corrección no pertenece a ticket activo |
| P2 | #665 config, #664 smoke | Manifest de env fail-closed, seeds y rutas mínimas de operación verificadas en runtime |
| P2 | CI/deployment drift | Confirmar Node/npm lock, configuración Render/Vercel, estado real de Actions y rollback para candidate |

## Matriz verificable de arquitectura / infraestructura
| Requisito | Evidencia de source | Estado |
|---|---|---|
| Fronteras de producto/módulo definidas | `AGENTS.md`, `docs/ARCHITECTURE_BOUNDARIES_V1.md` | VERIFIED (definición), NOT VERIFIED (enforcement runtime) |
| Rutas y catálogo en paridad 60/60 | Dos manifiestos actuales | VERIFIED (inspección estática), NOT EXECUTED (audit script) |
| Autenticación/RBAC/RLS real por tenant | Contratos/middleware/QA existentes | NOT VERIFIED (runtime/DB, `#651` abierto) |
| Integridad contable Decimal, cierre y replay | Tests/domain/invariantes en `AGENTS.md` | NOT VERIFIED (ejecución) |
| Builds frontend/backend + browsers | package scripts, workflow | NOT EXECUTED en esta revisión |
| Configuración de entorno segura | #665 abierto | PARTIAL en gobierno; startup no comprobado |
| Hípico PWA/Android/WhatsApp físico y soak | #119, #120 abiertos | NOT VERIFIED |
| Backup, restore, PITR / DR production | #842 abierto | NOT VERIFIED |
| Proveedores IA/OmniRoute | Only read-only external documentation (#974) | OUT OF SCOPE (runtime) |

## Aplicación de tres skills a esta auditoría
- **Ponytail:** diffs documentales y wrappers mínimos; no nuevas dependencias, scripts o proxies; rechaza refactor de productos sin aceptación específica.
- **Addy:** issue #974 especifica aceptación; branch/PR dedicado; pruebas de pin/contrato + revisión antes de merge. Tests únicamente con evidencia del candidato.
- **OmniRoute:** evaluación threat-model estática: cualquier gateway adicional requiere aislamiento de secretos, PII, auditoría, fallback medido, decisión de data residency y aprobación de un ticket independiente; no se activó ningún servicio.

## Limitaciones
No se clonó/ejecutó el monorepo completo, ni se realizaron builds, PostgreSQL, browser E2E, CI verde, QA física, pentest o despliegue real durante la inspección remota inicial. No se infiere ausencia de bugs de la existencia de archivos. Revalidar la matriz contra el SHA exacto antes de usarla como release gate.
