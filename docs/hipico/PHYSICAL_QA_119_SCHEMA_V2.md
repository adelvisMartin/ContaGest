# Control Hípico #119 — Physical QA schema v2

## Hallazgo corregido

La primera versión del recorder tenía una sola `environment` y un único conjunto de 16 escenarios. Eso permitía completar la lista en un solo dispositivo/modo y no demostraba la matriz física solicitada.

Schema v2 usa una colección `environments`. Cada environment declara como mínimo:

- `id` estable;
- `mode`: `pwa-browser`, `pwa-standalone` o `android-apk`;
- `device`;
- metadata opcional de Android/OEM/browser/APK/session hashes;
- sus propios 16 escenarios.

El gate exige al menos un environment para **cada modo requerido**. Por tanto un candidato mínimo produce 3 × 16 = 48 filas de escenario.

## Flujo CLI

```bash
node scripts/hipico-physical-qa-v119.mjs init
node scripts/hipico-physical-qa-v119.mjs add-env --id=chrome-desktop --mode=pwa-browser --device="Desktop Chrome"
node scripts/hipico-physical-qa-v119.mjs add-env --id=pwa-phone --mode=pwa-standalone --device="Android PWA"
node scripts/hipico-physical-qa-v119.mjs add-env --id=apk-phone --mode=android-apk --device="Android APK"
node scripts/hipico-physical-qa-v119.mjs record --env=apk-phone --scenario=fresh-install --status=PASS --evidence=fresh-install.png
node scripts/hipico-physical-qa-v119.mjs invariant --name=sourceReadOnly --status=PASS
node scripts/hipico-physical-qa-v119.mjs status
node scripts/hipico-physical-qa-v119.mjs check
```

Los tres invariantes SOURCE/LAB siguen siendo globales y deben quedar PASS. Cualquier FAIL/BLOCKED/NOT_EXECUTED impide `releasePhysicalGate=PASS`.

## Evidencia

Los paths deben ser relativos al directorio del artifact; `..` y paths absolutos se rechazan. `check` verifica existencia y genera SHA-256 por archivo.

## Migración

Evidence schema v1 se conserva como histórico, pero no se considera prueba de `device × mode × scenario`. Un candidate final debe reinicializar schema v2.
