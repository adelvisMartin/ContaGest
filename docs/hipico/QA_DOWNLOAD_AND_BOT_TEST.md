# Control Hípico · descargar, instalar y probar hoy

**Actualizado:** 2026-09-29  
**Código:** `main`, registrando el SHA exacto antes de QA.  
**UI:** v4.1.3.  
**WhatsApp Bridge:** `1.6.0`.

Este procedimiento es la autoridad manual mientras los GitHub-hosted runners no ejecuten steps. Un comando local sólo cuenta como PASS si realmente termina correctamente en tu laptop.

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

## 4. Preparar WhatsApp Bridge v1.6.0

Primera vez:

```text
CONFIGURAR-GRUPOS-HIPICO.cmd
```

El helper prepara el runtime local, abre WhatsApp Web con perfil dedicado y captura SOURCE/LAB como IDs `@g.us` distintos sin enviar mensajes.

Datos locales sensibles:

```text
%LOCALAPPDATA%\ControlHipicoBridge\data\group-bindings.json
%LOCALAPPDATA%\ControlHipicoBridge\data\group-bindings.env
```

No subirlos a Git.

## 5. Verificar política/capacidades antes de iniciar

Desde `tools\hipico-whatsapp-web-bridge`:

```powershell
npm run source:policy
```

Esperado para la prueba actual:

- adapter `playwright-web` implementado;
- LAB técnicamente disponible;
- SOURCE auto-reply `DISABLED` si no fue solicitado;
- si alguien intenta habilitar SOURCE, estado `NO_GO` con `SOURCE_AUTO_REPLY_POLICY_NO_GO`.

La Política de mensajes de WhatsApp Business revisada 2026-09-29 prohíbe facilitar apuestas con dinero real; una licencia, un país o un flag `.env` no convierten este flujo en GO.

## 6. Probar autonomía segura

Después del binding:

```text
PROBAR-HIPICO-LAB.cmd
```

O:

```text
INICIAR-HIPICO-AUTONOMO.cmd
```

Esto significa **autonomía LAB**, no escritura SOURCE.

El Bridge puede:

- leer SOURCE;
- excluir mensajes propios;
- deduplicar;
- persistir/spoolear;
- clasificar y producir respuesta;
- responder automáticamente en LAB;
- leer entradas directas del LAB;
- reintentar sólo trabajo seguro;
- mantener entregas inciertas como `ambiguous`;
- reconectar/reiniciar conservando journals/colas.

No recibe autoridad automática para apostar, modificar saldos, escribir ledger, liquidar premios o publicar resultados definitivos.

### Corpus mínimo LAB

```text
hola
ayuda
CERRADO
LLEGADA 4-2-1
JUEGA 30K AL 5
CONSIGUE 20K 2N AL 3
```

## 7. Resiliencia obligatoria

Durante QA:

1. repite el mismo mensaje/evento;
2. corta Internet y recupéralo;
3. deja backend inaccesible y recupéralo;
4. cierra/reabre el bridge;
5. reinicia Windows;
6. cambia de LAB a otro chat justo antes de un envío;
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

El LAB verde no cambia el estado de política SOURCE. Mientras la política oficial mantenga el caso prohibido, SOURCE permanece read-only por diseño.
