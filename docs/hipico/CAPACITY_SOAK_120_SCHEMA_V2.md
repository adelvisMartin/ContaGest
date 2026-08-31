# Control Hípico #120 — Soak evidence v2

## Brechas corregidas

En v1 `--health-url` y `--spool-path` eran opcionales. Un run largo podía tener `healthChecks=0` y backlog `0` simplemente porque esas dimensiones no se observaron. Los recovery drills también podían declararse `PASS` por argumento CLI sin evidencia adjunta.

Además, spool v2 guarda records dentro de subdirectorios por estado (`queued`, `failed`, `sent`, `quarantined`, `replayed`, `expired`). Una inspección sólo del directorio raíz devolvería falsamente 0 archivos/bytes aunque existiera cola real.

Eso no es suficiente para un gate de 24–72 h.

## Requisitos v2

Para `PASS` de release se exige:

- candidate SHA exacto;
- duración >=24 h;
- SOURCE read-only PASS;
- LAB-only write PASS;
- health endpoint configurado;
- spool path configurado;
- health coverage >=90% de las muestras;
- estructura spool v2 válida (`queued/` + `failed/`) observada >=90% de las muestras;
- tamaño total del spool medido recursivamente;
- backlog age calculado sólo sobre records activos `queued + failed`, no sobre `sent/replayed` históricos;
- 4 drills requeridos con `status=PASS`, timestamp y al menos una referencia de evidencia;
- cero pérdida/duplicado/context leak por encima de policy;
- memoria/event-loop/backlog/spool/health dentro de thresholds.

Un run menor a 24 h sigue siendo `SMOKE_ONLY`, nunca evidencia de release.

## Drill evidence

El runner acepta `--drill-evidence=<archivo.json>`. El archivo debe estar ligado al mismo candidate SHA:

```json
{
  "candidateSha": "<40-hex>",
  "drills": {
    "bridge-restart": {"status":"PASS","at":"...","evidence":["bridge-restart.log"]},
    "backend-restart": {"status":"PASS","at":"...","evidence":["backend-restart.log"]},
    "lab-reconnect": {"status":"PASS","at":"...","evidence":["lab-reconnect.log"]},
    "source-session-reconnect-readonly": {"status":"PASS","at":"...","evidence":["source-reconnect.log"]}
  }
}
```

El SHA incorrecto hace fallar el run antes de considerarlo evidencia.

## Ejemplo

```bash
cd backend
npm run soak:hipico -- --duration-minutes=1440 --health-url=http://127.0.0.1:8787/health --spool-path=../tools/hipico-whatsapp-web-bridge/data/spool-v2 --drill-evidence=../artifacts/qa/hipico-v120/<sha>/drills.json --source-read-only=PASS --lab-only-write=PASS --sha=<sha>
```

No habilita escritura al SOURCE ni sustituye #119.
