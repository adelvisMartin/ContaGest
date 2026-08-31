# GitHub Actions #134 — diagnóstico reproducible

## Estado observado 2026-08-30

El workflow mínimo `Runner Probe #134` fue reintentado explícitamente. GitHub aceptó el rerun, pero el nuevo job `99384328070` terminó otra vez sin runner ni steps (`logs_url=null`, `steps=null`). El intento anterior `99304037366` presentaba el mismo patrón.

Esto prueba **no asignación de runner GitHub-hosted**. No prueba por sí solo si la causa raíz es billing/minutes, spending limit, política de cuenta, capacidad temporal de GitHub u otra condición externa.

## Comando

Con GitHub CLI autenticado para este repositorio:

```bash
GIT_SHA=$(git rev-parse HEAD) node scripts/github-actions-diagnostics-v134.mjs
```

El script consulta en modo sólo lectura:

- Actions permissions del repositorio;
- default workflow permissions;
- últimos pull-request runs;
- último `Runner Probe #134`;
- jobs, runner id/name y número de steps.

Genera:

```text
artifacts/qa/actions-v134/<sha>/diagnostic.json
artifacts/qa/actions-v134/<sha>/SHA256SUMS.txt
```

## Clasificación

- `ACTIONS_DISABLED`: Actions está deshabilitado a nivel repositorio.
- `HOSTED_RUNNER_NOT_ASSIGNED`: existe job, pero GitHub no asignó runner y no ejecutó steps.
- `RUNNER_EXECUTED`: existe runner y steps reales.
- `PROBE_NOT_AVAILABLE`: no se encontró el probe.
- `UNKNOWN_EXTERNAL`: evidencia insuficiente para clasificar.

`HOSTED_RUNNER_NOT_ASSIGNED` **no se convierte automáticamente en “billing”**.

## Checks de owner cuando el runner no se asigna

Revisar en la interfaz de GitHub:

1. Settings → Actions → General: Actions habilitado y políticas aplicables.
2. Settings/Billing and licensing: uso de Actions y spending limit/minutes para repositorios privados.
3. Cualquier política de cuenta/enterprise que afecte GitHub-hosted runners.
4. Estado público de GitHub si existe incidente activo.

No desactivar gates ni marcar checks como exitosos para sortear el problema.

## Cierre de #134

El issue sólo puede cerrarse cuando:

1. Runner Probe ejecuta steps reales.
2. `ContaGest CI / validate` ejecuta steps reales.
3. Un workflow PostgreSQL real levanta el servicio y ejecuta migraciones/tests.
4. Se registra la causa raíz comprobada y la recuperación.

El diagnóstico del repositorio queda automatizado; la asignación de un GitHub-hosted runner sigue siendo una capacidad externa a este código.
