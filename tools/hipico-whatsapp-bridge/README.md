# Hípico WhatsApp Group Bridge

Puente para la prueba **dentro de un grupo normal de WhatsApp** usando una sesión de WhatsApp Web vinculada a una cuenta que ya pertenece al grupo. No sustituye ni se presenta como la API oficial de Meta.

## Objetivo de la fase actual

La primera fase es **solo observación (shadow-only)**:

```text
Control hípico lab
   ↓
Cuenta WhatsApp / WhatsApp Business del laboratorio
   ↓  Dispositivos vinculados (QR)
whatsapp-web.js
   ↓  persistencia local antes de red
data/spool
   ↓  token dedicado
/api/v1/hipico-bot/bridge/events
   ↓
HipicoWebhookEvent + HipicoBotOutbox
   ↓
clasificación / deduplicación
```

En esta fase **no se responde al grupo y no se modifica una carrera, saldo, llegada, cierre o liquidación**. Hay dos bloqueos independientes: el endpoint devuelve `actions: []` y el Bridge mantiene `HIPICO_ALLOW_SEND=false`.

## Por qué no depende de Meta Developers

El grupo de laboratorio es un grupo normal. El listener es la cuenta real vinculada a WhatsApp Web, no un número de Cloud API. Meta Developers puede mantenerse como integración separada para pruebas 1:1, pero no es requisito para escuchar este grupo.

## Requisitos

- Windows/macOS/Linux con Internet estable.
- Node.js 22.x.
- La cuenta secundaria de WhatsApp o WhatsApp Business ya agregada a `Control hípico lab`.
- `HIPICO_GROUP_BRIDGE_TOKEN` configurado en Vercel y en el `.env` local del Bridge.

## Instalación en la PC que quedará escuchando el grupo

```bash
cd tools/hipico-whatsapp-bridge
npm install
copy .env.example .env
npm start
```

En macOS/Linux usa `cp .env.example .env` en lugar de `copy`.

Antes de `npm start`, edita únicamente el secreto de `.env`:

```text
HIPICO_GROUP_BRIDGE_TOKEN=<mismo valor configurado en Vercel>
```

La configuración de laboratorio ya apunta a:

```text
HIPICO_INGEST_URL=https://conta-gest-frontend.vercel.app/api/v1/hipico-bot/bridge/events
HIPICO_GROUP_NAME=Control hípico lab
HIPICO_ALLOW_SEND=false
```

## Primera vinculación

1. Ejecuta `npm start`.
2. Aparece un QR en la terminal.
3. En el teléfono de la cuenta secundaria abre WhatsApp/WhatsApp Business → **Dispositivos vinculados** → **Vincular dispositivo**.
4. Escanea el QR.
5. El Bridge busca exactamente `Control hípico lab`, guarda su ID localmente y empieza a escuchar solo ese grupo.
6. La sesión queda en `data/session` y los mensajes no entregados temporalmente quedan en `data/spool`.

## Primer QA real

Con el Bridge mostrando `WhatsApp Web listo`, envía desde el otro participante del grupo, uno por uno:

```text
hola
Juega 20 al caballo 3
Consigue 15 al 5
Cierre carrera 4
Llegada 2.1.6.4
Juega 20 al caballo 3
```

La última línea repite una jugada para comprobar deduplicación solo si WhatsApp conserva el mismo ID por reentrega técnica. Si la escribes de nuevo manualmente será correctamente tratada como un mensaje nuevo, porque WhatsApp genera otro ID.

Salida esperada en la terminal:

```text
[OK] source:<id> -> greeting
[OK] source:<id> -> betting_or_balance
[OK] source:<id> -> betting_or_balance
[OK] source:<id> -> race_close
[OK] source:<id> -> race_result
```

El grupo **no debe recibir ninguna respuesta del Bridge** en esta fase.

## Recuperación e idempotencia

Cada mensaje se escribe primero en `data/spool`. Si Vercel o Internet no responden, el archivo permanece y se reintenta cada 5 segundos. El backend usa `waweb:<externalMessageId>` como identificador único, por lo que una reentrega del mismo evento no debe crear otra fila ni otro outbox.

## Seguridad

- El Bridge solo procesa el grupo configurado.
- El secreto no se guarda en Git.
- El endpoint requiere `x-hipico-bridge-token`.
- `HIPICO_ALLOW_SEND=false` bloquea cualquier salida desde la PC.
- El backend fuerza `status=shadow` para todos los eventos de grupo.
- Chromium mantiene su sandbox por defecto; no actives `HIPICO_PUPPETEER_NO_SANDBOX=true` salvo en un host aislado donde sea imprescindible.
- Jugadas, montos, saldos, cierres, llegadas y liquidaciones no producen efectos automáticos durante este gate.

## Riesgo operativo

`whatsapp-web.js` automatiza WhatsApp Web y no es una API oficial de Meta. Puede verse afectado por cambios de WhatsApp o por restricciones de cuenta. Por eso se usa primero con el número secundario y el grupo controlado del laboratorio. La versión está fijada explícitamente en `package.json` para evitar actualizaciones inesperadas durante el QA.

## Promoción posterior

Solo después de comprobar recepción, deduplicación, continuidad offline, clasificación y trazabilidad se habilitará una segunda etapa. La habilitación de respuestas será un cambio explícito; nunca se obtiene únicamente cambiando `HIPICO_BOT_PROMOTION`.
