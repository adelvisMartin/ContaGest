# Control Hípico — Capacity & Soak #120

## Objetivo

Demostrar que Bridge/backend/parser/LAB no se degradan durante una jornada prolongada. Un smoke de minutos sirve para validar el harness; nunca cuenta como release soak.

## Política

`products/hipico-control/soak-policy-v120.json` fija antes del test:

- 24h mínimo para release;
- 48h recomendado;
- 72h preferido para RC;
- thresholds de crecimiento RSS/heap, event-loop p95, backlog age, duplicados, pérdidas, context leaks y health failure rate;
- drills obligatorios: restart Bridge, restart backend, reconnect LAB y reconnect SOURCE manteniendo read-only;
- evidencia SHA-bound obligatoria para SOURCE read-only, LAB-only write y session fallback safe.

## Runner de release

Desde `backend/`, sobre el mismo SHA candidato que se está validando:

```bash
GIT_SHA=<sha-40> npm run soak:hipico -- \
  --operator-id=<qa-operator> \
  --health-url=<bridge/backend-health> \
  --spool-path=<directorio-spool-v2> \
  --drill-evidence=<ruta/drill-evidence.json> \
  --safety-evidence=<ruta/safety-evidence.json>
```

`--duration-minutes=N` y `--sample-seconds=N` pueden sobrescribir duración/muestreo. El gate de release continúa exigiendo al menos 24 horas aunque el runner se invoque con menos tiempo.

### Evidence de invariantes

`--safety-evidence` debe apuntar a JSON del mismo `candidateSha`:

```json
{
  "candidateSha": "<sha-40>",
  "invariants": {
    "sourceReadOnly": {
      "status": "PASS",
      "at": "2026-09-10T12:00:00.000Z",
      "evidence": ["source-readonly.log"]
    },
    "labOnlyWriteDestination": {
      "status": "PASS",
      "at": "2026-09-10T12:00:00.000Z",
      "evidence": ["lab-only-write.log"]
    },
    "sessionFallbackSafe": {
      "status": "PASS",
      "at": "2026-09-10T12:00:00.000Z",
      "evidence": ["session-fallback-safe.log"]
    }
  }
}
```

Los tres invariantes necesitan `PASS`, timestamp y al menos una referencia de evidencia. Un SHA distinto aborta con `SAFETY_EVIDENCE_SHA_MISMATCH`. El manifest de entrada se copia dentro del artifact y se incluye en `SHA256SUMS.txt`.

### Evidence de drills

`--drill-evidence` usa el mismo principio:

```json
{
  "candidateSha": "<sha-40>",
  "drills": {
    "bridge-restart": {"status":"PASS","at":"2026-09-10T13:00:00.000Z","evidence":["bridge-restart.log"]},
    "backend-restart": {"status":"PASS","at":"2026-09-10T14:00:00.000Z","evidence":["backend-restart.log"]},
    "lab-reconnect": {"status":"PASS","at":"2026-09-10T15:00:00.000Z","evidence":["lab-reconnect.log"]},
    "source-session-reconnect-readonly": {"status":"PASS","at":"2026-09-10T16:00:00.000Z","evidence":["source-reconnect-readonly.log"]}
  }
}
```

Los flags declarativos `--source-read-only`, `--lab-only-write`, `--session-fallback-safe` y `--drill-*` se conservan para diagnóstico/smoke, pero por sí solos no satisfacen el release gate porque no aportan evidencia material ligada al SHA.

El runner reutiliza el escenario LAB de 120 eventos de #151 y registra RSS, heap, CPU, event loop p95, spool size/age, health y decisiones.

## Smoke

```bash
npm run soak:hipico:smoke
```

El resultado esperado de un smoke sano es `SMOKE_ONLY` o `BLOCKED` si faltan invariants/drills/evidence. Nunca `PASS` de release.

## Artifacts

```text
artifacts/qa/hipico-v120/<candidate-sha>/
  samples.jsonl
  drill-evidence-input.json   # cuando se provee
  safety-evidence-input.json  # cuando se provee
  summary.json
  SHA256SUMS.txt
```

El summary contiene duración real, thresholds, candidate SHA, counts, evaluación y hashes de los inputs de evidencia materializados.

## Regla fail-closed

- duration <24h → `SMOKE_ONLY` si no existe otra violación/bloqueo;
- drill no ejecutado/bloqueado o sin evidence → `BLOCKED`;
- SOURCE/LAB/session invariant no verificada o sin evidence SHA-bound → `BLOCKED`;
- candidate SHA distinto en evidence → aborta el runner;
- threshold excedido → `FAIL`;
- sin muestras → `NOT_EXECUTED`;
- sólo la combinación completa puede producir `PASS`.

## Estado actual

El harness y thresholds están implementados y el release gate exige evidencia ligada al SHA. Este entorno no ejecutó 24–72h ni los restart/reconnect físicos, por lo que #120 permanece abierto hasta obtener evidence real sobre el SHA de release.
