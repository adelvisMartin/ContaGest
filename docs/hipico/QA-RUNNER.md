# Control Hípico · QA Runner reproducible por SHA

Issue: #103  
Producto: **Control Hípico**  
Alcance: PWA + backend Hípico + WhatsApp Bridge + paridad Android automatizable.

## Objetivo

El comando canónico local es:

```bash
npm run qa:hipico
```

El runner captura el commit exacto, branch y estado dirty **antes** de ejecutar QA. No hace `reset`, `clean`, `checkout`, `stash` ni borra cambios locales. Un working tree dirty se registra como evidencia; no se “arregla” automáticamente.

La salida se guarda bajo:

```text
artifacts/qa/hipico-v103/<candidate-sha>/<run-id>/
  qa-report.json
  qa-report.md
  SHA256SUMS.txt
```

Cada ejecución queda ligada al SHA observado. Un SHA desconocido produce `BLOCKED`; nunca se publica como candidato verificado. Ejecutar dos veces el mismo SHA crea directorios de ejecución independientes (timestamp + PID) y conserva hashes propios.

Si el runner termina por una excepción no controlada, la evidencia fatal también queda bajo `artifacts/qa/hipico-v103/<candidate-sha>/fatal-*`; no se desvía a un directorio temporal sin relación con el candidato.

## Estados permitidos

El runner usa únicamente:

- `PASS`: el step se ejecutó y terminó correctamente;
- `FAIL`: el step se ejecutó y demostró una regresión/fallo;
- `BLOCKED`: falta toolchain/infraestructura o una dependencia externa impide ejecutar el step;
- `NOT_EXECUTED`: el modo seleccionado omitió explícitamente ese step.

`BLOCKED` y `NOT_EXECUTED` **nunca** se convierten en `PASS`.

### Exit codes

- `0`: todos los steps ejecutados requeridos quedaron `PASS`;
- `1`: existe al menos un `FAIL`;
- `2`: no hubo `FAIL`, pero existe `BLOCKED` o `NOT_EXECUTED` que impide afirmar gate completo.

Esto evita que un CI interprete un runner sin navegador/JDK/Android SDK como release verde.

## Modos

### Full local

```bash
npm run qa:hipico -- --mode=full
```

Ejecuta backend, corpus/contratos Hípico, checks estáticos PWA/API, Bridge, auditoría high severity, paridad PWA↔Android y, si el toolchain está disponible, APK debug reproducible.

Para exigir el APK:

```bash
HIPICO_QA_ANDROID=build npm run qa:hipico -- --mode=full
```

En PowerShell:

```powershell
$env:HIPICO_QA_ANDROID='build'
npm run qa:hipico -- --mode=full
```

Si JDK/Android SDK no están disponibles, el APK queda `BLOCKED`, nunca PASS.

### CI

```bash
HIPICO_QA_ANDROID=skip npm run qa:hipico -- --mode=ci
```

El workflow #103 valida PWA/backend/Bridge/paridad web. El APK mantiene además su gate dedicado `.github/workflows/hipico-android-rc.yml` con JDK/Android SDK real.

### Quick

```bash
HIPICO_QA_SKIP_INSTALL=1 HIPICO_QA_ANDROID=skip npm run qa:hipico -- --mode=quick
```

Úsese sólo cuando los lockfiles ya están instalados y se desea repetir los contratos. El reporte marca explícitamente los installs omitidos como `NOT_EXECUTED`, por lo que quick no debe usarse como evidencia de release completo.

## Cobertura automatizable

El runner ejecuta o verifica:

1. candidate SHA exacto, branch y dirty state;
2. Node 22, npm y git;
3. `npm ci` raíz desde lockfile;
4. lanzamiento real de Playwright Chromium headless y cierre limpio; comprobar sólo que exista el ejecutable no es suficiente;
5. typecheck del backend;
6. auditoría de dependencias backend high severity;
7. backend Hípico (`npm run test:hipico`);
8. todos los contratos raíz `tests/hipico*.test.mjs` presentes en el checkout;
9. PWA manifest/shell;
10. presencia + sintaxis de los targets canónicos PWA/API/Bridge; un archivo esperado faltante produce `FAIL`, no desaparece del reporte;
11. instalación bloqueada del WhatsApp Web Bridge;
12. `npm run qa` del Bridge;
13. `npm audit --audit-level=high` del Bridge;
14. instalación del wrapper Android;
15. `npm run verify:web` para paridad PWA↔wrapper;
16. APK debug si se solicita y el toolchain existe;
17. SHA-256 del conjunto canónico completo de manifest, service worker, build-info y lockfiles Bridge/Android; falta cualquiera => `BLOCKED`;
18. Markdown + JSON + SHA256SUMS ligados al candidate SHA.

El runner **no** escribe en un grupo real de WhatsApp, no habilita `HIPICO_ALLOW_SEND`, no crea apuestas, no modifica saldo/ledger y no ejecuta QA físico Android.

## Static/lint contract

Control Hípico no introduce ESLint como dependencia ficticia sólo para cumplir el nombre “lint”. La higiene automatizable se compone de los contratos existentes y checks reproducibles del stack: typecheck backend, `node --check` sobre los targets JS canónicos, tests de contratos y audits de dependencias. Si el repositorio adopta un linter canónico en el futuro, se incorpora a este gate mediante un ticket/commit explícito, no mediante una herramienta inventada en documentación.

## Redacción de evidencia

Antes de persistir stdout/stderr se redactan, como mínimo:

- Bearer tokens/JWT;
- variables con nombres `*TOKEN`, `*SECRET`, `*PASSWORD`, `*KEY`;
- teléfonos venezolanos detectables;
- IDs completos de grupos WhatsApp `@g.us`.

No usar el reporte como mecanismo para volcar `.env`, cookies, perfiles WhatsApp o payloads de clientes.

## Casos de regresión de #103

`npm run test:hipico:runner` cubre:

- comando deliberadamente roto → `FAIL` + exit no-cero;
- tool inexistente → `BLOCKED`;
- clasificación de fallos de red/browser/toolchain;
- lanzamiento real de Chromium;
- target canónico faltante no puede omitirse silenciosamente;
- inventario de hashes exige el conjunto completo;
- redacción de token/teléfono/group ID;
- repo temporal en una ruta con espacios;
- dirty working tree conservado, sin clean/reset/stash;
- candidate SHA desconocido no obtiene PASS;
- evidencia fatal permanece SHA-bound;
- SHA-256 determinista en ejecución repetida.

El runner incluye además el hook de test `HIPICO_QA_TEST_INJECT_FAIL=<step>`. Sólo existe para fixtures controladas; no debe configurarse en release.

## Browser/PWA

#103 establece el preflight real de navegador y la base de evidencia, pero no sustituye #105. Lanzar Chromium correctamente demuestra que el browser toolchain funciona; **no** demuestra por sí solo QA visual/funcional de las vistas. La matriz visual/funcional responsive y navegador real pertenece a #105.

## Android físico

La compilación debug automatizada tampoco equivale a instalación real. Deben conservarse como gates separados:

```text
APK build PASS
≠
APK install PASS
≠
Android physical QA PASS
```

Los últimos dos requieren dispositivo/emulador según el ticket de release correspondiente.

## WhatsApp físico

De forma análoga:

```text
Bridge unit/static PASS
≠
LAB physical PASS
≠
production group PASS
```

#103 termina antes de cualquier escritura física a WhatsApp. El LAB simulator y la promoción al grupo real se gobiernan por sus tickets propios.

## Criterio de promoción

Una release candidate Hípico sólo puede citar este gate si el reporte:

- contiene el SHA exacto que se quiere promover;
- conserva el estado dirty capturado y no oculta cambios locales;
- no fue editado manualmente;
- conserva `SHA256SUMS.txt`;
- no contiene `FAIL`;
- no oculta `BLOCKED/NOT_EXECUTED`;
- contiene el inventario canónico completo de fuentes/lockfiles esperado;
- se complementa con los gates físicos/browser/release requeridos por el alcance de la release.
