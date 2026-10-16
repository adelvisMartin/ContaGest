# Control Hípico · descargar, instalar y probar hoy

**Actualizado:** 2026-09-29  
**Código:** `main`, registrando el SHA exacto antes de QA.  
**UI:** v4.1.3.  
**WhatsApp Bridge:** `1.6.0`.

Este procedimiento es la autoridad manual mientras los GitHub-hosted runners no ejecuten steps. Un comando local sólo cuenta como PASS si realmente termina correctamente en tu laptop.

## 0. Descarga ZIP por SHA exacto (sin Git)

En GitHub, abre `https://github.com/adelvisMartin/ContaGest/commits/main` y copia el SHA completo de 40 caracteres del commit de `main` que quieres instalar. No uses el SHA de un PR sin fusionar. En PowerShell, sustituye el valor de `$sha`:

```powershell
$sha = 'PEGAR_SHA_COMPLETO_DE_MAIN'
if ($sha -notmatch '^[a-fA-F0-9]{40}$') { throw 'El SHA debe contener 40 caracteres hexadecimales.' }
$zip = Join-Path $env:USERPROFILE ('Downloads\ContaGest-' + $sha + '.zip')
Invoke-WebRequest -Uri ('https://github.com/adelvisMartin/ContaGest/archive/' + $sha + '.zip') -OutFile $zip
Get-FileHash -LiteralPath $zip -Algorithm SHA256
Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $env:USERPROFILE 'Desktop\ContaGest-QA')
```

Guarda el SHA de `main`, la huella SHA-256 del ZIP, la fecha y la versión de Node.js; la huella identifica el archivo descargado, no demuestra por sí sola la autoría del commit. Entra a la carpeta extraída que contiene `package.json`. **Si elegiste ZIP, omite la sección 1 (sólo sirve para checkout Git).**

Un ZIP no tiene `.git`. El gate `QA-PRODUCCION.ps1` ejecuta `git diff --check` y por eso no puede declararse PASS completo desde ZIP. Para comenzar las pruebas reales del Bridge LAB en Node.js 22 desde la raíz extraída:

```powershell
cd tools\hipico-whatsapp-web-bridge
npm ci
npm run qa
npm run source:policy
cd ..\..
$env:GIT_SHA = $sha
node scripts/hipico-physical-qa-v119.mjs init
```

El comando `init` crea únicamente la matriz física inicial con `NOT_EXECUTED`, no evidencia PASS. Las pruebas Android, Chromium/Windows, PostgreSQL y el soak #120 se ejecutan y documentan por separado. SOURCE permanece sólo lectura y LAB pinneado es el único destino permitido. No subas tokens, sesiones, datos `.env` ni perfiles de WhatsApp a Git/artifacts.

## 1. Actualizar el proyecto

En la terminal de VS Code / PowerShell:

```powershell
git switch main
git pull --ff-only
git rev-parse HEAD
```

Guarda ese SHA. No mezcles una carpeta vieja, un APK antiguo o un Pages de otro SHA con la prueba actual.

## 2. Gate local del repositorio

```powershell
.\QA-PRODUCCION.ps1
```

Revisa la evidencia generada en `artifacts\qa`. Si falta una dependencia real (Android SDK, navegador, PostgreSQL, etc.) clasifica el bloque como `BLOCKED/NOT_EXECUTED`; no lo conviertas en PASS.

## 3. Frontend / PWA

Verifica:

- UI System v4.1.3, paleta y `system/light/dark`;
- header global;
- sidebar 224px/66px persistente;
- vistas principales full-width;
- controles compactos desktop y >=44px touch;
- modales/dialogs con una sola autoridad de focus/Escape/inert/return-focus;
- toasts success/error/warning/info con iconos SVG canónicos;
- Centro Operativo sin overlap;
- offline/online sin perder workspace;
- service worker `r35-overlay-authority-v4-1-3` o superior.

Los visual baselines de Playwright se revisan explícitamente; CI no debe fabricarlos con `--update-snapshots`.

## 4. WhatsApp Messenger real: lectura y envío automáticos bloqueados (#1011)

**Decisión vigente 2026-10-16:** No ejecutar `CONFIGURAR-GRUPOS-HIPICO.cmd`, `INICIAR-HIPICO-AUTONOMO.cmd`, `PROBAR-HIPICO-LAB.cmd`, `history:v130`, backfill, captura de IDs ni Browser/Playwright sobre una cuenta o grupo real de WhatsApp Messenger. El runtime cuenta con un gate de inicio `SOURCE_AUTO_READ_POLICY_NO_GO` (PR #1120) independiente del gate `SOURCE_AUTO_REPLY_POLICY_NO_GO`. Ambos deniegan lectura y envío automatizados aunque el grupo sea recreativo y sin dinero real.

Para consultar la decisión **sin abrir un navegador, crear un perfil ni leer conversaciones**, usar desde el Bridge:

```powershell
npm run source:policy
```

La salida esperada declara `NO_GO` y puede terminar con código **2** (significa bloqueo por política, no éxito de integración con Messenger). No introducir un flag, otro cliente o una sesión personal para eludirlo. Consultar [SOURCE_AUTO_READ_NO_GO_V1011.md](SOURCE_AUTO_READ_NO_GO_V1011.md).

## 5. LAB sintético y pruebas de dominio sin WhatsApp real

Se permiten tests locales con fixtures sintéticos y pruebas de contratos que no importen ni arranquen el Bridge de captura. Verifica cada comando antes de ejecutarlo para asegurar que no lanza Chromium ni WhatsApp Web. Los resultados de QA físico con dos sesiones reales permanecen `BLOCKED` por la política mientras no exista un mecanismo autorizado, no `PASS`.

Ejemplos de texto ficticio para pruebas de parser sin credenciales ni cuentas:
```text
hola
ayuda
CERRADO
LLEGADA 4-2-1
JUEGA 30K AL 5
CONSIGUE 20K 2N AL 3
```

## 6. Sugerencia manual editable en la PWA

El Centro Operativo incorpora un campo **vacío**, escrito por una persona. Muestra fuente y fecha, permite editar, exige confirmación explícita para **copiar** y tiene botón **Cancelar y borrar**. El borrador se borra al cerrar. Ni copiar ni cerrar abren WhatsApp, invocan un envío, leen el grupo o registran movimientos financieros. La persona decide por su cuenta si usa la función de compartir nativa y dónde colocar el texto; nunca se automatiza el chat.

## 7. Resiliencia obligatoria

Durante QA:

1. repite el mismo mensaje/evento;
2. corta Internet y recupéralo;
3. deja backend inaccesible y recupéralo;
4. cierra/reabre el bridge;
5. reinicia Windows;
6. valida una transición de destino LAB sintético usando fixtures, sin conectar una cuenta real;
7. prueba contexto de texto y, cuando aplique, media/PDF sin conceder autoridad financiera;
8. confirma visualmente cero mensajes automáticos en SOURCE.

Esperado:

- no doble efecto;
- identity guard cancela chat equivocado;
- `ambiguous` no se reintenta a ciegas;
- spool vuelve a converger;
- dead letters se mantienen en cero o con causa investigada.

## 8. Diagnóstico

```powershell
cd tools\hipico-whatsapp-web-bridge
npm run diagnostic:status
npm run source:policy
npm run healthcheck
```

Archivos clave:

```text
%LOCALAPPDATA%\ControlHipicoBridge\data\health.json
%LOCALAPPDATA%\ControlHipicoBridge\data\bridge.log
%LOCALAPPDATA%\ControlHipicoBridge\data\spool-v2\
%LOCALAPPDATA%\ControlHipicoBridge\data\source-replies\
%LOCALAPPDATA%\ControlHipicoBridge\data\dead-letter\
```

Confirma `sourceSendPossible=false`, bindings correctos y ausencia de secretos/textos completos de chats en diagnósticos normales.

## 9. Criterio de PASS de la jornada

PASS local sólo si:

- SOURCE zero-send;
- LAB responde sin duplicados;
- reconnect/restart no duplica;
- delivery ambigua queda reconciliable;
- health/policy diagnostics son coherentes;
- no hay filtración de secretos;
- las colas convergen;
- no hay dead letters inexplicadas.

El LAB verde no cambia el estado de política SOURCE. Mientras la política oficial mantenga el caso prohibido, SOURCE real permanece NO_GO para lectura y escritura automatizadas.
