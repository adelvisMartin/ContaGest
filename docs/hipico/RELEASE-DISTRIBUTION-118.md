# Control Hípico · Release & Distribution #118

## Objetivo

Asegurar que PWA y APK se puedan identificar, comparar y recuperar sin confundir build, QA y producción. Este documento define el contrato de ingeniería; la publicación a tienda y la promoción al grupo real requieren autorización separada.

## Fuente canónica

`products/hipico-control/release-policy.json` es la fuente declarativa para:

- `version`;
- `versionCode` Android;
- canal `lab | pilot | stable`;
- schema local compatible;
- contrato de parser;
- applicationId Android;
- política de signing;
- condiciones de promoción.

El release actual es `1.13.0-rc2`, canal `pilot`, `versionCode=1130002`.

### Fórmula versionCode

Para versiones `MAJOR.MINOR.PATCH-rcN`:

```text
MAJOR × 1,000,000
+ MINOR × 10,000
+ PATCH × 100
+ N
```

Ejemplo: `1.13.0-rc2` → `1,130,002`.

La fórmula evita reutilizar un versionCode en upgrades posteriores dentro de esta línea de versión.

## Contrato de compatibilidad

PWA y APK deben declarar el mismo conjunto:

```text
product         control-hipico
version         1.13.0-rc2
workspaceSchema 10
parserContract  whatsapp-parser-v1
channel         pilot
```

La PWA lo expone en `build-info.json`. El wrapper Android copia el mismo runtime y `sync-web.mjs` compara lista de archivos + SHA-256.

El gate `scripts/hipico-release-v118.mjs` además verifica que coincidan:

- `build-info.json`;
- `APP_VERSION` de `assets/js/config.js`;
- `<meta name="application-version">`;
- `CACHE_VERSION` del Service Worker;
- `android/hipico-control-v1130/package.json`;
- `capacitor.config.json`;
- `workspace.schemaVersion`;
- release policy.

Una divergencia produce `RELEASE_BLOCKED` y exit code no cero.

## Android

`npm run cap:sync` dentro del wrapper ejecuta en este orden:

```text
sync web canónico
→ asegurar plataforma Android
→ Capacitor sync
→ configure-version.mjs
```

`configure-version.mjs` fija `versionName` y `versionCode` en el Gradle generado antes de compilar.

### Identidades

- applicationId release/QA actual: `com.adelvis.hipicocontrol.rel`;
- debug QA usa la firma debug generada por Android/Gradle;
- claves release reales **no viven en Git, archivos de proyecto ni logs**;
- signing release queda `NOT_EXECUTED` hasta suministrar un secreto externo autorizado.

## Evidencia por SHA

Preflight:

```bash
node scripts/hipico-release-v118.mjs
```

Después de construir el APK QA:

```bash
node scripts/hipico-release-v118.mjs --require-apk
```

Artifacts:

```text
artifacts/qa/hipico-v118/<SHA>/release-manifest.json
artifacts/qa/hipico-v118/<SHA>/SHA256SUMS.txt
android/hipico-control-v1130/artifacts/Hipico-Control-v<version>-debug.apk
android/hipico-control-v1130/artifacts/QA_APK_METADATA.json
android/hipico-control-v1130/artifacts/SHA256SUMS.txt
```

`QA_APK_METADATA.json` incluye SHA candidato, version/versionCode, canal, schema y parser contract.

## Canales

### lab

- datos sintéticos o de QA;
- Bridge LAB;
- cambios experimentales;
- nunca habilita escritura al source real.

### pilot

- candidato operable por equipo controlado;
- requiere P0 automatizados verdes cuando la infraestructura permita ejecutarlos;
- requiere QA físico antes de declararse verificado.

### stable

- sólo después de promoción explícita;
- requiere evidence SHA-bound, QA físico, rollback demostrado y aprobaciones aplicables;
- stable **no autoriza por sí mismo** automatización monetaria ni WhatsApp real.

## Fresh install / upgrade / reinstall

### Fresh install

Validar:

1. firma/applicationId esperados;
2. arranque sin crash;
3. build-info visible y versión correcta;
4. workspace nuevo inicializa schema compatible;
5. offline shell disponible después del primer arranque exitoso.

### Upgrade N-1 → N

Antes de instalar N:

1. export/backup según #117;
2. registrar SHA/version del origen;
3. instalar N sin borrar datos;
4. validar workspace/schema;
5. abrir jornadas/participantes/settings representativos;
6. comprobar Service Worker nuevo y ausencia de bundles mezclados.

### Reinstall

No prometer conservación de almacenamiento local tras desinstalar. Un restore válido depende del backup/restore de #117.

## Downgrade

No se permite downgrade in-place automático cuando el schema local del candidato sea menor que el schema existente. El procedimiento seguro es:

```text
backup compatible
→ desinstalar/limpiar perfil sólo con autorización
→ instalar versión anterior
→ restaurar únicamente si el restore gate declara compatibilidad
```

Si la compatibilidad no está demostrada: `BLOCKED`, no forzar.

## Service Worker / rollback PWA

`CACHE_VERSION` debe coincidir con `version`. Al activar, el SW elimina caches `hipico-control-*` de versiones distintas.

Rollback PWA:

1. identificar SHA/version estable anterior;
2. comprobar compatibilidad de schema;
3. redeploy exacto del artifact/commit anterior;
4. verificar que el SW candidato reemplaza cache actual;
5. abrir recovery y flujos críticos;
6. registrar evidencia.

No editar sólo `sw.js` para “forzar” un verde: PWA, build-info y release policy deben permanecer coherentes.

## Rollback APK

Android normalmente impide instalar un `versionCode` menor sobre uno mayor. Por eso el rollback no se resuelve improvisando un downgrade. Las opciones controladas son:

- publicar/build de rollback con **versionCode mayor** y código estable anterior, o
- desinstalación controlada + restore compatible en LAB/pilot.

La decisión debe registrar versión, SHA, backup y resultado del restore.

## Gates

| Gate | Autoridad | Estado esperado |
| --- | --- | --- |
| metadata/compatibility | `hipico-release-v118.mjs` | PASS requerido |
| PWA↔Android wrapper parity | `sync-web.mjs --check-only` | PASS requerido |
| APK build debug QA | `hipico-android-rc.yml` | PASS requerido para artifact QA |
| APK signature verify | `apksigner` | PASS cuando tool disponible |
| install/upgrade/lifecycle | #119 físico | PASS requerido antes de stable |
| backup/restore | #117 | PASS/evidencia compatible |
| P0 Hípico | roadmap #102 | sin P0 abiertos para el scope |
| producción WhatsApp | #121/#154 | autorización separada |

## Lo que este ticket NO afirma

- que Play Store esté publicado;
- que una firma release real haya sido usada;
- que upgrade/downgrade físico haya pasado si no hay dispositivo/emulador ejecutado;
- que WhatsApp real esté autorizado;
- que un build exitoso equivalga a release aprobado.

## Criterio de cierre

El código de distribución puede mergearse fail-closed, pero #118 sólo debe cerrarse como verificado cuando exista ejecución real sobre el SHA candidato y los drills requeridos estén documentados. `BLOCKED/NOT_EXECUTED` nunca se transforma en PASS por inferencia.
