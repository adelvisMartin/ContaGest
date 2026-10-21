# Control Hípico — Physical QA #119

> **Campaña final en dispositivos:** [procedimiento operativo, matriz y decisiones NO_GO](PHYSICAL_QA_119_FINAL_CAMPAIGN.md). Este enlace organiza la ejecución diferida, no acredita pruebas físicas ni habilita SOURCE.

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

## Dos jornadas — fechas y evidencia independientes (hardening #119)

`source-to-lab-e2e-day-1` y `source-to-lab-e2e-day-2` **no pueden apuntar a la misma grabación**. Para cada entorno/device que marque ambos escenarios `PASS`, se requieren:

- `observedAtUtc` para ambos escenarios, en formato ISO UTC canónico `YYYY-MM-DDTHH:mm:ss.sssZ`, nunca fecha futura;
- jornada 2 posterior a jornada 1 con separación **mínima de 24 horas**;
- evidencia material con **huellas SHA-256 diferentes** en ambos días. Copiar el mismo video bajo otro nombre no acredita dos jornadas;
- todas las demás exigencias habituales: operador, identidades hash SOURCE/LAB separadas, tres modos, escenario completo, APK versión/hash, SHA candidato vigente, y no saltarse los bloqueos de política #1011.

Registrar desde la CLI (ejemplo de sintaxis, **no prueba ejecutada**):

```sh
node scripts/hipico-physical-qa-v119.mjs record --env=apk --scenario=source-to-lab-e2e-day-1 --status=PASS --evidence=day1-sanitized.log --observed-at=2026-10-14T14:00:00.000Z
node scripts/hipico-physical-qa-v119.mjs record --env=apk --scenario=source-to-lab-e2e-day-2 --status=PASS --evidence=day2-sanitized.log --observed-at=2026-10-15T15:00:00.000Z
```

`status` y `check` devuelven `twoDayEvidenceComplete` y `twoDayEvidenceErrors`; si hay evidencia duplicada o faltan fechas la puerta es `NOT_READY`. El archivo canónico `physical-qa-evidence.json` conserva por entorno `physicalDays.day1ObservedAtUtc` y `physicalDays.day2ObservedAtUtc`, junto a los hashes de cada evidencia para auditoría posterior. El verificador posterior `scripts/hipico-verify-evidence-v290.mjs` comprueba nuevamente esas fechas y huellas, además de `summary.twoDayEvidenceComplete === true`; un artefacto anterior o que sólo declare `PASS` no acredita dos días. **Esto solo valida metadatos y archivos aportados por la persona, no demuestra que se efectuaran pruebas físicas.** La autorización para automatizar SOURCE sigue denegada por #1011; por tanto, si el escenario requiere esa conexión, debe registrarse `BLOCKED`, nunca fabricarse `PASS`.

Los fixtures automáticos del repositorio son sintéticos y prueban el validador, no teléfonos, sesiones ni dos jornadas reales.

## Estado real actual

El harness está implementado, pero este entorno no dispone de los teléfonos/tablets, sesiones WhatsApp y jornadas físicas requeridas. Por tanto #119 debe permanecer abierto hasta ejecutar la matriz. `NOT_EXECUTED` no es PASS.

## Vinculación del APK probado a la release (hardening #119)

Un resultado físico **PASS** requiere que el entorno `android-apk` declare `apkVersion` igual a `products/hipico-control/release-policy.json` y `apkSha256` con el SHA-256 completo del APK debug/QA realmente instalado. Los indicadores `apkArtifactBound` y `releasePhysicalGate` impiden certificar jornadas Android sin esa identidad. Un número de versión coincidente sin huella SHA-256 no es suficiente.

Ejemplo al registrar el entorno (rellenar con el hash del artefacto REAL, no un valor de prueba):

    node scripts/hipico-physical-qa-v119.mjs add-env --id=apk-android --mode=android-apk --device="Android físico" --apk-version=1.13.0-rc3 --apk-sha256=<sha256-calculado> --source-session-hash=<hash> --lab-session-hash=<hash>

Este cambio valida el **dato de identidad declarado por el operador**, no sustituye la instalación física, no descarga el APK y no acredita su hash por sí solo. Debe adjuntarse evidencia sanitizada independiente del artefacto verificado y de las pruebas ejecutadas en el mismo dispositivo.
