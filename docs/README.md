# Índice maestro de documentación — ContaGest VE

Este directorio es el punto de entrada para documentación técnica, operacional, de seguridad, QA y arquitectura. El índice debe acompañar los cambios del producto: una capacidad implementada sin runbook, contrato o evidencia verificable no debe presentarse como producción verificada.

## 1. Fuente de autoridad

Antes de cambiar código o configuración:

1. [`../AGENTS.md`](../AGENTS.md) — protocolo global del repositorio, gates y reglas por riesgo.
2. Ticket/issue correspondiente y sus criterios de aceptación.
3. Código/configuración actualmente ejecutable en el SHA candidato.
4. Skills versionadas en [`../.agents/skills/`](../.agents/skills/).
5. Documentación específica de esta carpeta.
6. Tests y artifacts generados por el mismo SHA.

Cuando dos fuentes entren en conflicto, no se debe “reconciliar” inventando comportamiento: se investiga el contrato vigente y se documenta la decisión.

## 2. Arquitectura y decisiones

Los ADR financieros existentes incluyen, entre otros:

- [`ADR_FINANCIAL_DECIMAL_V90.md`](ADR_FINANCIAL_DECIMAL_V90.md) — precisión/semántica decimal.
- [`ADR_LEDGER_POSTING_LIFECYCLE_V91.md`](ADR_LEDGER_POSTING_LIFECYCLE_V91.md) — lifecycle de posting del ledger.
- [`ADR_FINANCIAL_IDEMPOTENCY_V92.md`](ADR_FINANCIAL_IDEMPOTENCY_V92.md) — idempotencia financiera.
- [`ADR_BANKING_AUDITABLE_BALANCE_V93.md`](ADR_BANKING_AUDITABLE_BALANCE_V93.md) — balance bancario auditable.
- [`ADR_INVENTORY_DERIVED_BALANCES_V94.md`](ADR_INVENTORY_DERIVED_BALANCES_V94.md) — balances derivados de inventario.
- [`ADR_TRANSACTIONAL_IMPORT_V95.md`](ADR_TRANSACTIONAL_IMPORT_V95.md) — importaciones transaccionales.
- [`ADR_FISCAL_GOVERNANCE_V96.md`](ADR_FISCAL_GOVERNANCE_V96.md) — gobernanza fiscal.

Nuevas decisiones estructurales deben documentar contexto, decisión, alternativas, invariantes, migración y rollback; no deben ocultarse dentro de un PR grande.

## 3. Seguridad, acceso, RBAC y tenant isolation

- [`ACCESS_SECURITY_V1114.md`](ACCESS_SECURITY_V1114.md) — controles de acceso endurecidos de la plataforma.
- Código y tests de auth/RBAC/tenant son la autoridad ejecutable cuando una guía quede desactualizada.

Checklist mínimo para cambios con datos:

- autenticación requerida donde corresponda;
- autorización/RBAC server-side;
- tenant/owner scope explícito;
- negativos A→B y B→A;
- validación de entrada y límites;
- secretos/PII redactados;
- audit/idempotencia cuando haya efectos persistentes;
- caches, jobs, exports y búsquedas incluidos en la revisión de aislamiento.

## 4. Financial Core y datos

El código financiero debe preservar invariantes de precisión, ledger, idempotencia y auditoría definidos por los ADR anteriores. OCR, LLM, importadores y providers pueden proponer información, pero no sustituyen la autoridad contable ni la revisión humana cuando el flujo la exige.

Para pruebas de persistencia/concurrencia se debe usar PostgreSQL real, aislado y efímero; nunca una base compartida de desarrollo/producción.

## 5. Control Hípico

La arquitectura canónica de Control Hípico se mantiene en código bajo `backend/src/modules/hipico`, sus adapters/compatibilidad bajo `backend/src/modules/hipico-bot`, la PWA bajo `frontend/public/hipico-control`, y tooling operacional bajo `tools/` y `scripts/`.

Fronteras que deben permanecer estables:

```text
/api/v1/hipico/*      = producto / autoridad API canónica
/api/v1/hipico-bot/*  = integración / compatibilidad / Bridge
PostgreSQL            = autoridad persistente de servidor
WhatsApp              = channel adapter, no autoridad del dominio
Agent/LLM             = candidato/asistente, no autoridad financiera
```

El release guard actual contiene contratos explícitos para estas fronteras y debe tratarse como regresión obligatoria cuando se modifique Hípico.

## 6. WhatsApp, Bridge y CLI

La mensajería debe seguir este recorrido conceptual:

```text
Channel → Adapter → Normalize/Dedupe → Domain/Application → Policy → Outbox → Output Adapter
```

Invariantes:

- SOURCE read-only;
- LAB/destino de simulación explícito;
- identity/group pinning, sin fallback inseguro por nombre;
- dedupe + replay idempotente;
- history sync no dispara envíos;
- delivery ambiguo se reconcilia antes de reintentar;
- secretos/JIDs/PII fuera de outputs no autorizados;
- automatización monetaria fuera de auto-act.

El CLI canónico está en `tools/hipico-cli/` y se invoca desde la raíz con `npm run hipico -- --help`.

## 7. Document intelligence y hostile input

Los pipelines de documentos deben conservar:

- provenance;
- dedupe;
- cuarentena/fail-closed;
- límites de tamaño/recursos;
- MIME/content validation;
- protección SSRF para providers/URLs;
- OCR como extracción, nunca como autoridad económica;
- defensa contra prompt/tool injection cuando un modelo procese contenido no confiable.

No crear un segundo pipeline documental si la capacidad puede integrarse en el pipeline canónico existente.

## 8. UX/UI, responsive y accesibilidad

ContaGest ERP y Control Hípico pueden compartir principios, pero no deben fusionar accidentalmente sus autoridades CSS.

QA visual relevante debe cubrir, según alcance:

```text
360 / 390 / 430 / 768 / 1024 / 1440
light / dark / system
200% zoom
keyboard + focus
reduced motion
loading / empty / error / success
offline / stale / permission / unavailable / not_configured / degraded
```

Los comandos raíz de QA UI se documentan en `package.json` (`qa:ui`, `qa:ui:deep`, `qa:ui:58`, `qa:a11y`).

## 9. QA de sistema

- [`SYSTEM_QA_CAMPAIGN_V155.md`](SYSTEM_QA_CAMPAIGN_V155.md) — campaña de QA de sistema vinculada al issue #155.
- `tests/`, `qa/` y los scripts `qa:*`/`test:*` de los workspaces forman la autoridad ejecutable.

No se permite convertir un bloqueo de infraestructura en PASS funcional. Un job sin runner/steps/logs es evidencia de infraestructura, no de que el código haya fallado o pasado.

## 10. Release, CI y evidencia exact-SHA

- [`RELEASE_EVIDENCE.md`](RELEASE_EVIDENCE.md) — protocolo unificado de evidencia exact-SHA.
- `scripts/hipico-release-guard-v290.mjs` — release guard canónico Hípico.
- `scripts/hipico-verify-evidence-v290.mjs` — verificación de artifacts/evidencia.
- `scripts/hipico-release-report-v290.mjs` — reporte de release.
- `.github/workflows/hipico-production-gates-v290.yml` — gates productivos Hípico.
- `.github/workflows/actions-recovery-v134.yml` y `.github/workflows/ci-runner-probe-v134.yml` — recuperación/diagnóstico de Actions #134.

Una evidencia se etiqueta como `PASS`, `FAIL`, `BLOCKED` o `NOT_EXECUTED`; únicamente `PASS` significa que el gate realmente se ejecutó y aprobó para el SHA reportado.

## 11. Protección de `main`

Tooling versionado para #97:

- `scripts/github-main-protection-v97.mjs`;
- `scripts/apply-main-protection-v97.ps1`;
- `APLICAR-PROTECCION-MAIN.cmd`.

La presencia de esos archivos no demuestra que GitHub tenga la protección activa. La configuración remota debe comprobarse después de aplicarla. Required checks sólo deben habilitarse cuando el CI asociado sea estable y exista una ruta break-glass auditable.

## 12. Agents y skills

- [`AGENT_SKILLS_AND_MCP.md`](AGENT_SKILLS_AND_MCP.md) — guía de integración de agents/skills/MCP.
- [`../AGENTS.md`](../AGENTS.md) — política global.
- [`../.agents/skills/`](../.agents/skills/) — skills versionadas.

Verificación:

```bash
npm run skills:check
```

Cada skill relevante al riesgo debe declarar trigger/authority/invariants/forbidden actions/tests/evidence/rollback o equivalentes ejecutables.

## 13. Operaciones, PWA y Android

La evidencia de código/browser no sustituye QA física. Instalación real, background, reboot, permisos, conectividad, PWA/APK y WhatsApp real se reportan de manera separada y permanecen `NOT_EXECUTED`/`BLOCKED` hasta que existan artifacts físicos verificables.

Para cualquier operación destructiva o migración consulta primero los scripts/runbooks vigentes del repositorio y confirma el entorno objetivo; no ejecutes reset/migrate contra datos compartidos por conveniencia.

## 14. Troubleshooting

Clasifica antes de cambiar código:

```text
PRODUCT_FAILURE
TEST_FAILURE
INFRASTRUCTURE_FAILURE
EXTERNAL_BLOCKER
NOT_EXECUTED
```

Para GitHub Actions, si `runner_id=0`, no hay runner name y `steps=[]`, no existe evidencia de ejecución del código del repositorio. Investiga cuenta/usage/policy/runner antes de editar tests o workflows por hipótesis.

## 15. Cómo mantener este índice

Cuando se añada, renombre o retire documentación de arquitectura, seguridad, QA, release u operaciones:

1. actualiza este índice en el mismo PR;
2. evita enlaces a paths no existentes;
3. marca claramente qué es contrato, runbook, diseño o evidencia histórica;
4. no copies secretos, payloads sensibles ni credenciales en ejemplos;
5. liga resultados de release al SHA exacto, no a nombres de rama mutables.