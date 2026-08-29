# Guía de estudio · #118 Release & Distribution de Control Hípico

## Idea principal

Una “versión” no es sólo un texto como `1.13.0`. Para poder auditar una app necesitas responder:

- ¿qué commit produjo este artifact?;
- ¿qué schema local entiende?;
- ¿qué parser espera?;
- ¿PWA y APK llevan exactamente el mismo runtime?;
- ¿qué firma se usó?;
- ¿se puede actualizar sin perder datos?;
- ¿cómo se vuelve atrás?

#118 convierte esas preguntas en contratos verificables.

## 1. versionName vs versionCode

En Android:

- `versionName` es el texto humano (`1.13.0-rc2`);
- `versionCode` es un entero que Android usa para decidir si una instalación es más nueva.

Dos APK con el mismo `versionName` pero distinto código pueden comportarse de manera distinta para upgrades. Por eso ambos se fijan desde la release policy.

## 2. Fuente canónica

`products/hipico-control/release-policy.json` evita que cada archivo invente su propia versión.

El gate compara esa policy con:

```text
build-info.json
APP_VERSION
meta application-version
Service Worker cache version
Android package.json
workspace schema
Capacitor applicationId
```

Si uno difiere, el release se bloquea.

## 3. Artifact by SHA

Un APK llamado `app-debug.apk` no dice de dónde salió. #118 genera metadata con el SHA candidato y un SHA-256 del archivo.

```text
source commit SHA
       ↓
build
       ↓
APK bytes
       ↓
SHA-256 + metadata
```

Así puedes comprobar que el archivo que instalas es el mismo que fue validado.

## 4. PWA ↔ APK parity

Capacitor empaqueta una copia del runtime web en `www`. `sync-web.mjs` compara cada archivo con la PWA canónica. Si una sola copia difiere, el gate falla.

Paridad significa **mismos bytes web**, no que el APK ya haya sido probado físicamente.

## 5. Service Worker

Una PWA puede parecer “vieja” incluso después de desplegar nuevo código si el navegador sigue sirviendo un cache anterior. Por eso la versión del cache también forma parte del contrato de release.

## 6. Signing

La firma demuestra quién produjo/autorizó un APK. Las claves release son secretos y no deben estar en el repositorio.

En QA puede usarse debug signing. En producción el build debe consumir una clave externa protegida y registrar sólo metadata/fingerprint no secreto.

## 7. Upgrade y rollback

Un rollback no es simplemente “instalar el APK anterior”. Android puede bloquear un `versionCode` menor y un schema nuevo puede ser incompatible con código viejo.

La estrategia correcta considera:

```text
backup
→ compatibilidad de schema
→ artifact exacto
→ política versionCode
→ restore drill
→ evidencia
```

## 8. Estados de evidencia

- `PASS`: ejecutado y correcto;
- `FAIL`: ejecutado y falló;
- `BLOCKED`: una limitación externa impidió continuar;
- `NOT_EXECUTED`: no se intentó;
- `SOURCE_REVIEW`: comprobado sólo en código/configuración.

Nunca conviertas `NOT_EXECUTED` en PASS porque “debería funcionar”.

## Archivos para estudiar

1. `products/hipico-control/release-policy.json`
2. `scripts/hipico-release-v118.mjs`
3. `android/hipico-control-v1130/scripts/sync-web.mjs`
4. `android/hipico-control-v1130/scripts/configure-version.mjs`
5. `android/hipico-control-v1130/scripts/package-qa-apk.mjs`
6. `.github/workflows/hipico-android-rc.yml`
7. `docs/hipico/RELEASE-DISTRIBUTION-118.md`

## Preguntas de repaso

1. ¿Por qué `versionName` no es suficiente en Android?
2. ¿Qué problema resuelve una release policy canónica?
3. ¿Qué demuestra un hash SHA-256 y qué NO demuestra?
4. ¿Por qué PWA↔APK parity no sustituye QA físico?
5. ¿Qué riesgo tiene un Service Worker con cache versionado incorrectamente?
6. ¿Por qué las signing keys no deben aparecer en GitHub?
7. ¿Por qué un downgrade puede requerir restore en vez de instalación directa?
8. ¿Cuál es la diferencia entre release candidate y autorización de producción?

## Ejercicio

En una rama de práctica cambia sólo el `version` de `build-info.json` y ejecuta el gate #118. Debe fallar con `RELEASE_BLOCKED`. Revierte el cambio después. El objetivo es comprobar que el gate detecta drift, no fabricar un release nuevo.
