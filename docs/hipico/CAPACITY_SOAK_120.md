# Control Hípico — Capacity & Soak #120

## Objetivo

Demostrar sobre un SHA exacto que Bridge/backend/parser/LAB se mantienen estables durante una jornada prolongada y que los reinicios/reconexiones no degradan la separación SOURCE/LAB. Un smoke de minutos valida el harness; nunca cuenta como release soak.

## Precondición obligatoria

El soak de release se ejecuta **después** de #119. Debe existir el `manifest.json` final de Physical QA para el mismo `candidateSha`, con `releasePhysicalGate=PASS`, `materialEvidenceComplete=true`, `completedAt` válido y hashes SHA-256 de sus archivos de evidencia. #120 vuelve a verificar esos hashes antes de comenzar y al terminar el soak.

## Política v5

`products/hipico-control/soak-policy-v120.json` fija antes del test:

- 24 h mínimo para release, 48 h recomendado y 72 h preferido para RC;
- thresholds de crecimiento RSS/heap, event-loop p95, backlog age, spool, duplicados, pérdidas, context leaks y health failure rate;
- health y spool observados durante al menos 90% de las muestras;
- drills obligatorios: restart Bridge, restart backend, reconnect LAB y reconnect SOURCE manteniendo SOURCE read-only;
- operador QA identificado;
- Physical QA #119 completa sobre el mismo SHA;
- evidencia material real para SOURCE read-only, LAB-only write y session fallback safe;
- evidencia material real para cada drill.

Los flags declarativos existen únicamente para smoke/diagnóstico. **No pueden producir PASS de release.**

## Preparar evidence manifests

Antes de iniciar las 24–72 h crea dos JSON ligados al SHA candidato. Los archivos referenciados deben estar en el mismo directorio o debajo del manifest, nunca mediante rutas absolutas, `..`, symlinks o directorios. El runner exige archivos regulares, resuelve `realpath`, calcula SHA-256 y copia la evidencia de #120 dentro del artifact inmutable del intento.

### `safety-evidence.json`

```json
{
  "candidateSha": "<sha-40>",
  "invariants": {
    "sourceReadOnly": {"status":"NOT_EXECUTED","at":null,"evidence":[]},
    "labOnlyWriteDestination": {"status":"NOT_EXECUTED","at":null,"evidence":[]},
    "sessionFallbackSafe": {"status":"NOT_EXECUTED","at":null,"evidence":[]}
  }
}
```

Durante el soak se actualiza. Para release, los tres invariantes deben terminar `PASS` y su `at` representa la **verificación final del run**: debe caer dentro de los últimos 15 minutos del soak (se toleran hasta 5 minutos de desviación de reloj al final). Así una declaración antigua no puede probar que SOURCE permaneció read-only durante toda la ejecución.

`evidence` acepta una ruta relativa o una entrada con hash ya conocido:

```json
{"path":"source-readonly-final.log","sha256":"<64-hex>"}
```

Si se aporta `sha256`, el runner lo verifica. Si sólo se aporta la ruta, el runner calcula y conserva el hash igualmente.

### `drill-evidence.json`

```json
{
  "candidateSha": "<sha-40>",
  "drills": {
    "bridge-restart": {"status":"NOT_EXECUTED","at":null,"evidence":[]},
    "backend-restart": {"status":"NOT_EXECUTED","at":null,"evidence":[]},
    "lab-reconnect": {"status":"NOT_EXECUTED","at":null,"evidence":[]},
    "source-session-reconnect-readonly": {"status":"NOT_EXECUTED","at":null,"evidence":[]}
  }
}
```

Cada drill debe ejecutarse **durante el soak**, quedar `PASS`, tener timestamp dentro de la ventana real del run y al menos un archivo de evidencia material. Los manifests pueden editarse desde otra terminal mientras el soak sigue corriendo; el runner los vuelve a leer al finalizar.

## Runner de release

Desde la raíz del repositorio:

```bash
SHA=$(git rev-parse HEAD)
GIT_SHA="$SHA" npm --workspace backend run soak:hipico -- \
  --duration-minutes=1440 \
  --operator-id=<qa-operator> \
  --health-url=<bridge/backend-health> \
  --spool-path=<directorio-spool-v2> \
  --physical-evidence=artifacts/qa/hipico-v119/$SHA/manifest.json \
  --safety-evidence=<ruta/safety-evidence.json> \
  --drill-evidence=<ruta/drill-evidence.json>
```

Las rutas relativas de argumentos se resuelven desde la raíz del repositorio aunque npm ejecute el script con `backend/` como working directory. Para un release, el runner también comprueba que el SHA solicitado coincide con el `HEAD` del checkout actual.

Antes de gastar 24 horas, el preflight rechaza SHA sin ligar, SHA diferente a HEAD, operador ausente, health URL inválida, spool sin configurar, Physical QA ausente y manifests safety/drills inexistentes o ligados a otro SHA.

## Smoke

```bash
npm run soak:hipico:smoke
```

Un smoke usa un intento separado y nunca reutiliza evidencia de release. Su resultado sano será `SMOKE_ONLY` o `BLOCKED`; nunca `PASS` de release.

## Artifacts inmutables por intento

Cada ejecución crea un directorio nuevo. No se sobreescriben ni mezclan muestras de runs anteriores:

```text
artifacts/qa/hipico-v120/<candidate-sha>/<attempt-id>/
  samples.jsonl
  physical-evidence-v119.json
  safety-evidence-input.json
  drill-evidence-input.json
  safety-material/
  drill-material/
  summary.json
  soak-evidence.json   # sólo existe cuando el run real de release termina PASS
  SHA256SUMS.txt
```

`attempt-id` se genera automáticamente con timestamp+PID o puede fijarse mediante `--attempt-id=<id>` para una ejecución coordinada. Un ID ya existente falla cerrado con `SOAK_ATTEMPT_ALREADY_EXISTS`.

El summary schema v5 conserva candidate SHA, attempt ID, HEAD observado, operador, duración real, cobertura health/spool, thresholds, resultado, hashes de inputs y hashes de los archivos materializados.

Cuando y sólo cuando el run real cumple duración de release (>=24 h) y `evaluation.status=PASS`, el runner genera además `soak-evidence.json` con schema `hipico-soak-evidence.v120`. Ese artifact queda ligado al mismo SHA, incluye operador/timestamps/policy, evaluación completa, invariantes/drills y los hashes de evidencia. Un smoke, un run bloqueado o un FAIL no genera ese artifact.

El verifier de release v290 descubre `soak-evidence.json` como evidencia opcional exact-SHA. La revisión de código no depende de él, pero **stable promotion sí exige que el gate `soak` sea PASS**. Si el artifact real no existe, el estado es `NOT_EXECUTED`; no existe selector manual para convertirlo en PASS.

## Regla fail-closed

- Physical QA #119 ausente/incompleta/hash inválido → aborta o `BLOCKED`;
- candidate SHA sin ligar, distinto de HEAD o distinto en cualquier manifest → aborta;
- evidence path inválido, faltante, symlink, directorio, escape de ruta o hash distinto → aborta;
- duration <24 h → `SMOKE_ONLY` si no existe otra violación/bloqueo;
- drill no ejecutado, fuera de la ventana del run o sin evidence material → `BLOCKED`;
- SOURCE/LAB/session invariant no verificada al final del run o sin evidence material → `BLOCKED`;
- health/spool sin cobertura suficiente → `BLOCKED`;
- threshold excedido → `FAIL`;
- sin muestras → `NOT_EXECUTED`;
- sólo la combinación completa puede producir `PASS`.

## Estado actual

El harness implementa los gates y la integridad de evidence, pero este cambio **no afirma** que ya hayan ocurrido las 24–72 h, los restart/reconnect físicos ni el Physical QA real. #120 debe seguir abierto hasta obtener evidencia material del candidato definitivo.
