# Control Hípico — Capacity & Soak #120

## Objetivo

Demostrar que Bridge/backend/parser/LAB no se degradan durante una jornada prolongada. Un smoke de minutos sirve para validar el harness; nunca cuenta como release soak.

## Política

`products/hipico-control/soak-policy-v120.json` fija antes del test:

- 24h mínimo para release;
- 48h recomendado;
- 72h preferido para RC;
- thresholds de crecimiento RSS/heap, event-loop p95, backlog age, duplicados, pérdidas, context leaks y health failure rate;
- drills obligatorios: restart Bridge, restart backend, reconnect LAB y reconnect SOURCE manteniendo read-only.

## Runner

Desde `backend/`:

```bash
GIT_SHA=<sha> npm run soak:hipico -- \
  --source-read-only=PASS \
  --lab-only-write=PASS \
  --drill-bridge-restart=PASS \
  --drill-backend-restart=PASS \
  --drill-lab-reconnect=PASS \
  --drill-source-session-reconnect-readonly=PASS
```

Opcionales:

- `--health-url=<bridge/backend health>`;
- `--spool-path=<directorio spool>`;
- `--duration-minutes=N`;
- `--sample-seconds=N`.

El runner reutiliza el escenario LAB de 120 eventos de #151 y registra RSS, heap, CPU, event loop p95, spool size/age, health y decisiones.

## Smoke

```bash
npm run soak:hipico:smoke
```

El resultado esperado de un smoke sano es `SMOKE_ONLY` o `BLOCKED` si no se marcaron invariants/drills. Nunca `PASS` de release.

## Artifacts

```text
artifacts/qa/hipico-v120/<candidate-sha>/
  samples.jsonl
  summary.json
```

El summary contiene duración real, thresholds, candidate SHA, counts y evaluación.

## Regla fail-closed

- duration <24h → `SMOKE_ONLY`;
- drill no ejecutado/bloqueado → `BLOCKED`;
- SOURCE/LAB invariant no verificada → `BLOCKED`;
- threshold excedido → `FAIL`;
- sin muestras → `NOT_EXECUTED`;
- sólo la combinación completa puede producir `PASS`.

## Estado actual

El harness y thresholds están implementados. Este entorno no ejecutó 24–72h ni los restart/reconnect físicos, por lo que #120 permanece abierto hasta obtener evidence real sobre el SHA de release.
