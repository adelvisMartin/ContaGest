# Release evidence exact-SHA

Este documento define cómo reportar evidencia de release sin mezclar implementación, infraestructura y verificación. Describe el tooling **ya existente** del repositorio; no reemplaza sus scripts ni workflows.

## Objetivo

Toda afirmación de release debe responder, como mínimo:

```text
¿Qué SHA se verificó?
¿Qué gate se ejecutó?
¿Dónde se ejecutó?
¿Qué artifact produjo?
¿Cuál fue su estado real?
¿El artifact pertenece al mismo SHA?
```

Un nombre de rama, un PR merged o un deployment “latest” no bastan para demostrar esas respuestas.

## Estados permitidos

El verificador Hípico reconoce únicamente:

- `PASS` — evidencia válida del gate para el SHA candidato.
- `FAIL` — el gate se ejecutó o existe evidencia, pero incumple el contrato.
- `BLOCKED` — el gate no puede completarse por un bloqueo identificado.
- `NOT_EXECUTED` — no existe ejecución/evidencia suficiente.

`BLOCKED` y `NOT_EXECUTED` nunca deben convertirse en `PASS` por ausencia de logs o por una interpretación optimista.

## SHA candidato

Los scripts de Hípico resuelven el SHA desde variables versionadas y/o Git, y fallan cerrado cuando no es un SHA completo o no coincide con el checkout.

Para ejecución manual reproducible:

```bash
export HIPICO_CANDIDATE_SHA="$(git rev-parse HEAD)"
npm run release:hipico:v290
```

PowerShell:

```powershell
$env:HIPICO_CANDIDATE_SHA = (git rev-parse HEAD).Trim()
npm run release:hipico:v290
```

No fijes manualmente un SHA distinto al `HEAD` para “reutilizar” artifacts de otra revisión: el release guard lo rechaza.

## Gate de release Hípico

Comando:

```bash
npm run release:hipico:v290
```

El script `scripts/hipico-release-guard-v290.mjs` valida, entre otros invariantes:

- SHA candidato = checkout `HEAD`;
- scripts/workflow requeridos presentes;
- `/api/v1/hipico/*` como frontera canónica;
- `/api/v1/hipico-bot/*` preservada como integración/compatibilidad;
- operator read facade protegida y scopeada por owner/group;
- CLI usando endpoints canónicos y rechazando HTTP remoto inseguro;
- Agent sin acciones directas ni autoridad financiera;
- owner approval controlado por servidor;
- cadena PostgreSQL vigente y least-privilege checks;
- TestChannel fail-closed e identity mismatch;
- replay/idempotencia en production E2E;
- perfiles 100/500/2000;
- browser matrix declarada en el workflow productivo;
- ausencia de bypasses prohibidos como `skip/only`, `waitForTimeout`, `force: true` y `continue-on-error` en las superficies auditadas.

Cuando pasa, escribe `artifacts/qa/hipico-v290/release-guard.json` con schema, SHA, estado y invariantes.

## Verificación agregada de artifacts

Comando:

```bash
npm run verify:hipico:evidence:v290
```

Por defecto lee JSON bajo `artifacts/qa` (configurable mediante `HIPICO_EVIDENCE_ROOT`) y genera:

```text
artifacts/qa/hipico-v290/evidence-verification.json
```

La evidencia requerida actual es:

| Gate | Artifact | Schema aceptado |
| --- | --- | --- |
| Secret scan | `secret-scan.json` | `hipico-secret-scan.v290` / `hipico-secret-scan.v290-current` |
| Release guard | `release-guard.json` | `hipico-release-guard.v290-current` |
| PostgreSQL RBAC | `postgres-rbac.json` | `hipico-rbac.v290` / `hipico-rbac.v290-current` |
| PostgreSQL gate | `postgres-gate.json` | `hipico-postgres-gate.v290-current` |
| Restart/recovery | `restart-state.json` | `hipico-restart.v290` / `hipico-restart.v290-current` |
| Performance | `postgres-performance.json` | `hipico-performance.v290` / `hipico-performance.v290-current` |
| Manifest | `release-manifest.json` | `hipico-release-evidence.v1` |

El manifest requerido debe declarar worktree limpio (`dirty === false`). Todos los artifacts requeridos deben pertenecer al mismo SHA. Evidencia con SHA o schema incorrectos se clasifica como `FAIL`; evidencia ausente se clasifica como `NOT_EXECUTED`.

Artifacts opcionales que el verificador reconoce incluyen build info, metadata APK, Chromium, security y Android. La evidencia visual de browser se detecta además por screenshots bajo la ruta de QA esperada para el SHA.

## Reporte de release

Después de generar/verificar artifacts:

```bash
npm run report:hipico:v290
```

El reporte no debe usarse para elevar estados. Su función es resumir evidencia existente; si un gate está bloqueado o no ejecutado, debe permanecer así.

## CI/GitHub Actions

Antes de interpretar una X roja como defecto de código, confirma que el job realmente recibió runner y ejecutó steps.

### Pre-runner / infraestructura

Clasifica como bloqueo de infraestructura cuando la evidencia muestra simultáneamente, por ejemplo:

```text
runner_id = 0
runner_name = ""
steps = []
```

En ese caso:

1. no cambies código por hipótesis;
2. revisa cuenta/usage/policy/entitlement/runners;
3. usa el tooling de recuperación #134 ya versionado;
4. cuando la plataforma vuelva a asignar runner, ejecuta primero el probe mínimo;
5. después rerun de los gates reales sobre el SHA vigente.

Tooling existente:

```text
.github/workflows/actions-recovery-v134.yml
.github/workflows/ci-runner-probe-v134.yml
scripts/github-actions-diagnostics-v134.mjs
```

## Protección de `main`

La gobernanza remota forma parte de la evidencia de release, pero es independiente de que el código de protección exista.

Tooling #97:

```text
scripts/github-main-protection-v97.mjs
scripts/apply-main-protection-v97.ps1
APLICAR-PROTECCION-MAIN.cmd
```

No declares `main` protegida hasta verificar el estado remoto. Si el plan/permisos de GitHub impiden rulesets/protection, reporta `BLOCKED` con la respuesta real del proveedor.

No actives required checks inestables mientras #134 impida que esos checks obtengan runner, salvo que exista una estrategia break-glass explícita y auditable.

## PostgreSQL

Cuando un gate requiere persistencia real:

- usa PostgreSQL aislado y efímero;
- fixtures propios del run;
- aislamiento tenant/owner/group;
- cleanup incluso al fallar;
- least privilege/RLS cuando sea parte del contrato;
- nunca una base compartida de desarrollo/producción para fabricar evidencia E2E.

## Browser / UI

Una evidencia browser válida debe conservar el SHA y los artifacts del run correspondiente. Para UI relevante se espera cubrir los estados y viewports exigidos por el ticket; screenshots sin funcionalidad no reemplazan E2E, y E2E sin revisión visual no reemplaza una campaña pixel-perfect cuando ésta es criterio de aceptación.

## QA física y soak

QA física (#119) y soak (#120) son categorías separadas. Hasta ejecutar dispositivos/runtime real y un soak con la duración exigida, sus estados deben permanecer `NOT_EXECUTED` o `BLOCKED` según corresponda.

No es válido inferir que APK/PWA/WhatsApp real funciona porque el build o Chromium pasó.

## Plantilla de cierre

Cada ticket/release debe cerrar con una tabla equivalente a:

| Campo | Evidencia |
| --- | --- |
| Ticket | issue/EPIC |
| Baseline SHA | SHA antes del cambio |
| Final SHA | SHA exacto verificado |
| Causa raíz | demostrada, no hipotética |
| Solución | cambio mínimo/integrado |
| Archivos | paths modificados |
| Typecheck/lint/build | PASS / FAIL / BLOCKED / NOT_EXECUTED |
| Tests relevantes | PASS / FAIL / BLOCKED / NOT_EXECUTED |
| PostgreSQL | PASS / FAIL / BLOCKED / NOT_EXECUTED / N/A |
| Browser/E2E | PASS / FAIL / BLOCKED / NOT_EXECUTED / N/A |
| Runtime/deploy | PASS / FAIL / BLOCKED / NOT_EXECUTED / N/A |
| Seguridad/tenant | evidencia aplicable |
| CI published checks | estado del SHA final |
| Riesgos | residuales y follow-ups |
| Estado final | DONE / PARTIAL / BLOCKED / FAILED |

`DONE` requiere que los gates exigidos por el ticket estén ejecutados y aprobados; un bloqueo externo debe permanecer visible y separado de la calidad del código.