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

Cada ejecución queda ligada al SHA observado. Ejecutar dos veces el mismo SHA crea dos run directories independientes y conserva hashes de la evidencia de cada ejecución.

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

1. Node 22, npm y git;
2. `npm ci` raíz desde lockfile;
3. backend Hípico (`npm run test:hipico`);
4. todos los contratos raíz `tests/hipico*.test.mjs` presentes en el checkout;
5. sintaxis de PWA, service worker, runtime config, API bridge y bridge legacy;
6. instalación bloqueada del WhatsApp Web Bridge;
7. `npm run qa` del Bridge;
8. `npm audit --audit-level=high` del Bridge;
9. instalación del wrapper Android;
10. `npm run verify:web` para paridad PWA↔wrapper;
11. APK debug si se solicita y el toolchain existe;
12. hashes SHA-256 de fuentes/lockfiles representativos;
13. Markdown + JSON + SHA256SUMS ligados al candidate SHA.

El runner **no** escribe en un grupo real de WhatsApp, no habilita `HIPICO_ALLOW_SEND`, no crea apuestas, no modifica saldo/ledger y no ejecuta QA físico Android.

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
- clasificación de fallos de red/toolchain;
- redacción de token/teléfono/group ID;
- repo temporal en una ruta con espacios;
- dirty working tree conservado, sin clean/reset/stash;
- SHA-256 determinista en ejecución repetida.

El runner incluye además el hook de test `HIPICO_QA_TEST_INJECT_FAIL=<step>`. Sólo existe para fixtures controladas; no debe configurarse en release.

## Browser/PWA

#103 establece la base de evidencia, no sustituye #105. La matriz visual/funcional responsive y navegador real pertenece a #105. Un check estático de PWA no se documenta como browser PASS.

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
- no fue editado manualmente;
- conserva `SHA256SUMS.txt`;
- no contiene `FAIL`;
- no oculta `BLOCKED/NOT_EXECUTED`;
- se complementa con los gates físicos/browser/release requeridos por el alcance de la release.
