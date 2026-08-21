# Control Hípico · WhatsApp Web Bridge v1.3.0

Bridge Windows para usar **`CLUB HIPICO TRIPLE CROWN`** como fuente oficial de **solo lectura** y **`Control hípico lab`** como único destino opcional de simulaciones shadow.

## Invariantes

- el grupo oficial nunca es destino de envío;
- el histórico tampoco genera mensajes en LAB;
- `HIPICO_LAB_SEND_ENABLED=false` por defecto;
- ninguna predicción crea o confirma apuestas, cambia saldos, cierra carreras, aplica resultados o liquida;
- todo se persiste como evidencia shadow/pending e idempotente.

## Primera ejecución

`INICIAR-CONTROL-HIPICO-WHATSAPP.cmd` ejecuta:

1. validación de Node y del token protegido con Windows DPAPI;
2. instalación/verificación de `playwright-core 1.62.1`;
3. `node --check` + self-test de Chrome/Edge;
4. sincronización histórica de TRIPLE CROWN cuando todavía no existe un reporte completo;
5. reporte `data/history-sync-report.json`;
6. transición a escucha en tiempo real;
7. pregunta explícita para habilitar o no simulaciones únicamente en `Control hípico lab`.

## Histórico

El crawler `src/history-v130.mjs` recorre el chat hacia atrás usando WhatsApp Web oficial y recopila cada mensaje que el dispositivo vinculado permita cargar.

Valores por defecto:

- máximo 50.000 mensajes por ejecución;
- máximo 90 minutos;
- finalización cuando 8 rondas consecutivas dejan de entregar mensajes más antiguos;
- espera 1.200 ms entre rondas de carga;
- 4 subidas concurrentes al backend;
- checkpoint local de hasta 250.000 IDs.

Cada mensaje conserva, cuando WhatsApp Web lo expone:

- ID externo;
- remitente y etiqueta visible;
- fecha/hora visible;
- texto/caption;
- tipo de media (`image`, `video`, `audio`, `document`);
- nombre de PDF/documento visible;
- metadata `data-pre-plain-text`;
- clasificación y entidades extraídas por Control Hípico.

La carga es idempotente. Si se interrumpe, `data/spool-history/` conserva los pendientes y PostgreSQL deduplica por ID al reintentar.

### Qué significa “histórico completo”

El Bridge puede afirmar únicamente que alcanzó el **mensaje más antiguo que WhatsApp Web entregó al dispositivo vinculado**. No puede garantizar mensajes que WhatsApp no sincronice con ese dispositivo. El reporte deja auditables `earliestSourceTimestamp`, `latestSourceTimestamp`, `uniqueFound`, `delivered`, `duplicates`, `pending` y `stopReason`.

Un histórico se considera completo para este gate solo cuando:

```text
stopReason = stable_oldest_available
pending = 0
```

`REESCANEAR-HISTORICO-TRIPLE-CROWN.cmd` permite forzar otra pasada sin duplicar registros.

## Histórico → tiempo real sin ventana ciega

Después del backfill, los IDs subidos se guardan en `data/seen-source-message-ids.json`. El runtime `src/live-v130.mjs` carga ese checkpoint; si ya contiene IDs, **no crea un nuevo baseline**, sino que procesa inmediatamente cualquier mensaje visible que no esté en el histórico. Esto evita perder mensajes publicados mientras se cambia de backfill a vivo.

## Tiempo real

El grupo oficial puede permanecer archivado: el Bridge intenta abrirlo desde el sidebar y mediante la búsqueda global de WhatsApp Web.

Cada mensaje nuevo:

1. se persiste primero en spool local;
2. se envía al backend con `channelRole=source`, `shadowMode=true` y el canal canónico `club-hipico-triple-crown-official`;
3. se clasifica y persiste en el esquema Hípico shadow;
4. opcionalmente genera una simulación LAB marcada `[SHADOW:xxxxxxxxxx]`;
5. si el espejo está habilitado, esa simulación solo puede enviarse al grupo exacto `Control hípico lab`;
6. el navegador vuelve al grupo fuente.

## Multimedia

En v1.3.0 imagen/PDF/audio/video se registran como contexto y evidencia, pero el crawler histórico **no descarga ni interpreta automáticamente todos los binarios**. El texto visible, caption y nombre del documento sí se conservan. Los archivos que se entreguen expresamente podrán entrar en una capa multimodal posterior.

Una imagen o PDF por sí solos nunca son autoridad transaccional para crear una apuesta.

## Archivos locales

No versionar:

- `.env`
- `node_modules/`
- `data/chrome-profile/`
- `data/spool-history/`
- `data/spool-events/`
- `data/spool-lab-mirror/`
- `data/seen-source-message-ids.json`
- `data/history-sync-report.json`
- `data/bridge.log`
- `data/last-error.png`

El token protegido se mantiene fuera de la carpeta en `%APPDATA%\ControlHipico\bridge-token.dpapi`.
