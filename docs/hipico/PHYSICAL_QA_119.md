# Control Hípico — Physical QA #119

## Propósito

La revisión de source, Playwright o unit tests no demuestra Android/WebView, PWA instalada ni dos sesiones reales de WhatsApp. #119 exige evidencia manual/física ligada al candidate SHA.

## Matriz

El catálogo canónico está en `products/hipico-control/physical-qa-v119.json`. Incluye install/upgrade, lifecycle, reboot, permisos, offline/reconnect, sesiones SOURCE/LAB, QR/session recovery, identidad de grupo, dos jornadas SOURCE→LAB, scroll/overlap, batería/memoria básica, restore y handoff/restart.

## Regla de seguridad

Durante todo el gate:

```text
SOURCE = read-only
LAB    = único destino de escritura
```

Una sesión incorrecta/expirada no puede causar fallback de destino.

## Crear evidence file

En el candidate SHA exacto:

```bash
GIT_SHA=<40-char-sha> node scripts/hipico-physical-qa-v119.mjs init
```

Completar manualmente device metadata, invariants y cada scenario con `PASS|FAIL|BLOCKED|NOT_EXECUTED`. Añadir paths relativos de screenshots/video/log sanitizados en `evidence`.

## Consultar estado

```bash
node scripts/hipico-physical-qa-v119.mjs status --file=artifacts/qa/hipico-v119/<sha>/physical-qa.json
```

## Gate final

```bash
node scripts/hipico-physical-qa-v119.mjs check --file=artifacts/qa/hipico-v119/<sha>/physical-qa.json
```

`check` genera `manifest.json` + `SHA256SUMS.txt` y sale distinto de cero si queda cualquier `FAIL`, `BLOCKED`, `NOT_EXECUTED` o invariant SOURCE/LAB distinta de PASS.

## Evidencia mínima por escenario

Registrar:

- device/OEM/Android/browser/PWA mode;
- APK version y SHA-256 cuando aplique;
- precondición;
- pasos;
- resultado;
- evidencia sanitizada;
- finding P0–P3 si falla;
- candidate SHA.

No guardar QR, cookies, tokens, números personales, chats completos ni identificadores reales innecesarios.

## Dos jornadas

`source-to-lab-e2e-day-1` y `day-2` son independientes. Una sola prueba no satisface el DoD.

## Estado real actual

El harness está implementado, pero este entorno no dispone de los teléfonos/tablets, sesiones WhatsApp y jornadas físicas requeridas. Por tanto #119 debe permanecer abierto hasta ejecutar la matriz. `NOT_EXECUTED` no es PASS.

## Vinculación del APK probado a la release (hardening #119)

Un resultado físico **PASS** requiere que el entorno `android-apk` declare `apkVersion` igual a `products/hipico-control/release-policy.json` y `apkSha256` con el SHA-256 completo del APK debug/QA realmente instalado. Los indicadores `apkArtifactBound` y `releasePhysicalGate` impiden certificar jornadas Android sin esa identidad. Un número de versión coincidente sin huella SHA-256 no es suficiente.

Ejemplo al registrar el entorno (rellenar con el hash del artefacto REAL, no un valor de prueba):

    node scripts/hipico-physical-qa-v119.mjs add-env --id=apk-android --mode=android-apk --device="Android físico" --apk-version=1.13.0-rc3 --apk-sha256=<sha256-calculado> --source-session-hash=<hash> --lab-session-hash=<hash>

Este cambio valida el **dato de identidad declarado por el operador**, no sustituye la instalación física, no descarga el APK y no acredita su hash por sí solo. Debe adjuntarse evidencia sanitizada independiente del artefacto verificado y de las pruebas ejecutadas en el mismo dispositivo.
