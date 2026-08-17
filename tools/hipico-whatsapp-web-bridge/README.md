# Control Hipico · WhatsApp Web Bridge

Bridge local de laboratorio para observar el grupo normal **`Control hípico lab`** y enviar eventos normalizados al backend de Control Hipico en modo **shadow-only**.

## Motor canonico para QA de grupo

Esta herramienta es la version que paso las pruebas manuales reales del 17-08-2026:

- WhatsApp Web oficial (`https://web.whatsapp.com/`);
- Google Chrome o Microsoft Edge instalado en Windows;
- `playwright-core` fijado en `1.62.1`;
- perfil persistente del navegador;
- baseline del historial visible para no reprocesarlo al arrancar;
- spool local antes de cada POST al backend;
- reintento de pendientes;
- captura de diagnostico en `data/bridge.log` y `data/last-error.png`.

**No usa** `whatsapp-web.js`, Puppeteer protocol injection, Baileys ni una implementacion propia del protocolo de vinculacion.

## Seguridad obligatoria

`HIPICO_ALLOW_SEND=false` es un kill switch. Si se cambia a `true`, el runtime aborta. Durante este gate el Bridge:

- no envia mensajes al grupo;
- no crea ni confirma apuestas;
- no cambia saldos o disponibles;
- no cierra carreras;
- no aplica llegadas/pizarras;
- no liquida premios.

El backend `/api/v1/hipico-bot/bridge/events` tambien devuelve siempre `actions: []` y persiste el Outbox del grupo con `status=shadow`.

## Windows

1. Ejecuta `INICIAR-CONTROL-HIPICO-WHATSAPP.cmd`.
2. El setup valida Node, prepara `.env`, protege el token local con Windows DPAPI y valida el endpoint de Vercel.
3. Instala dependencias y ejecuta `npm run check` + `npm run selftest`.
4. Abre WhatsApp Web oficial.
5. Vincula el segundo numero si es la primera ejecucion.
6. Deja abierto `Control hípico lab` durante la prueba.

La sesion queda en `data/chrome-profile/`. Para desvincular solo el perfil local puede usarse `REINICIAR-WHATSAPP-WEB.cmd`.

## Archivos locales que nunca deben versionarse

- `.env`
- `node_modules/`
- `data/chrome-profile/`
- `data/spool/`
- `data/bridge.log`
- `data/last-error.png`

El token protegido se conserva fuera del proyecto en `%APPDATA%\ControlHipico\bridge-token.dpapi`.

## Evidencia ya obtenida

El gate inicial verifico en un grupo real de laboratorio:

- captura de mensajes de dos participantes;
- persistencia de la sesion despues de reiniciar;
- recuperacion despues de cortar/restablecer Internet;
- POST `202` a Vercel;
- persistencia en `HipicoWebhookEvent` y `HipicoBotOutbox`;
- deduplicacion real por `providerMessageId`;
- cero respuestas automaticas y cero efectos monetarios.

La fase siguiente usa el corpus operativo en `hipico-operational-classifier.test.ts` para ofertas `JUEGA/CONSIGUE`, confirmaciones, cierres, llegada/pizarra, disponibles, tercios, liquidacion, POLLA/PARLEY y correcciones.
