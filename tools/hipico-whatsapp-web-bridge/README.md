# Control Hípico · WhatsApp Web Bridge v1.4.0

Bridge local para el siguiente gate de operativa real:

```text
CLUB HIPICO TRIPLE CROWN (fuente oficial, SOLO LECTURA)
        ↓
WhatsApp Web oficial + Playwright
        ↓
backend /api/v1/hipico-bot/bridge/events
        ↓
clasificación + evidencia shadow + proyección
        ↓
Control hípico lab (simulación opcional, claramente marcada)
```

El modo `production` es el predeterminado y exige backend habilitado, URLs HTTPS,
token de 32+ caracteres, journal shadow y `/bridge/health` con persistencia lista.
El modo `shadow-local` existe únicamente para diagnóstico y nunca informa
`ready=true`.

## Regla principal

**El grupo oficial nunca es un destino de envío en esta versión.** El runtime no contiene una ruta genérica para escribir en TRIPLE CROWN. Solo puede observar el grupo fuente y, cuando `HIPICO_LAB_SEND_ENABLED=true`, enviar la simulación a `Control hípico lab` después de verificar que el chat activo coincide exactamente con el nombre del LAB.

Las apuestas, cierres, resultados, saldos y liquidaciones reales siguen bloqueados. El backend continúa devolviendo `actions: []` y toda evidencia operativa queda en estado shadow/pending.

## Fuente oficial

La fuente se localiza por `HIPICO_SOURCE_GROUP_MATCHES=CLUB HIPICO TRIPLE COWN|CLUB HIPICO TRIPLE CROWN`. Se usa coincidencia parcial intencionalmente para tolerar ambas grafías, emojis o sufijos visuales. Si el grupo está archivado, el Bridge intenta también la búsqueda global de WhatsApp Web; no es necesario desarchivarlo.

El canal canónico es estable y no depende del texto visible del chat:

```text
HIPICO_SOURCE_CHANNEL_KEY=club-hipico-triple-crown-official
```

Si ese canal aún no existe en PostgreSQL, el backend puede aprovisionarlo de forma idempotente **solo** con esa clave permitida y tomando el propietario del canal LAB existente. Si no encuentra exactamente un LAB válido, falla cerrado.

## Laboratorio

```text
HIPICO_LAB_GROUP_NAME=Control hípico lab
HIPICO_LAB_CHANNEL_KEY=control-hipico-lab
HIPICO_LAB_SEND_ENABLED=false
```

El envío al LAB está desactivado por defecto. `INICIAR.ps1` puede habilitarlo de forma explícita para una sesión de QA. Cada simulación lleva una etiqueta determinista `[SHADOW:xxxxxxxxxx]`; antes y después de enviar el Bridge verifica visualmente esa etiqueta para reducir duplicados después de un reinicio o retry.

## Persistencia y resiliencia

- WhatsApp Web oficial (`https://web.whatsapp.com/`).
- Chrome o Edge instalado en Windows.
- `playwright-core` fijado en `1.62.1`.
- Perfil persistente en `%LOCALAPPDATA%\ControlHipicoBridge\data\chrome-profile\`.
- IDs vistos del **grupo fuente** en `%LOCALAPPDATA%\ControlHipicoBridge\data\seen-source-message-ids.json`.
- Compatibilidad de lectura con el viejo `data/seen-message-ids.json` al actualizar desde v1.1.0.
- Spool de eventos entrantes en `data/spool-events/`.
- Spool independiente de simulaciones LAB en `data/spool-lab-mirror/`.
- Un evento fuente se persiste en backend antes de considerarse entregado.
- Si backend devuelve error/503, el evento permanece en spool y se reintenta.
- Después de intentar una simulación LAB, el Bridge vuelve siempre al grupo fuente.
- `health.json` publica `readiness.ready`, motivos de degradación y contadores sin exponer el token.
- El journal nuevo pseudonimiza remitente e IDs; el reporte oculta textos salvo habilitación explícita.
- Los diagnósticos DOM persisten solo roles y contadores; las capturas de pantalla están desactivadas por defecto para no copiar chats ajenos.

## Evidencia canónica

Un mensaje fuente puede quedar registrado en:

1. `HipicoWebhookEvent`: auditoría de transporte.
2. `HipicoBotOutbox`: compatibilidad `group_bridge`, siempre `shadow`.
3. `hipico_messages`: mensaje normalizado.
4. `hipico_operation_events`: evento operativo `pending` cuando aplique.
5. `hipico_shadow_evaluations`: predicción para comparar posteriormente contra la operación observada.

El código de este gate **no escribe** `hipico_ledger_entries` ni el `hipico_outbox` operativo.

## Multimedia

La v1.2.0 distingue metadata de `image`, `video`, `audio` y `document`/PDF cuando WhatsApp Web lo expone en el DOM. En este gate, un archivo es **contexto**, no autoridad transaccional: una imagen o PDF por sí solo no crea ni confirma una apuesta.

Cuando se incorporen muestras reales de los archivos del grupo, se añadirá una canalización separada de extracción/validación. Hasta entonces el dato que puede representar una intención de apuesta es el mensaje explícito del participante, sujeto además a validación de carrera, segmento, cierre, monto y formato.

## Windows

1. Ejecuta `INICIAR-CONTROL-HIPICO-WHATSAPP.cmd` sin privilegios de administrador.
2. El setup instala el runtime v1.4.0 bajo `%LOCALAPPDATA%`, recupera el token con DPAPI y valida Node, contratos, navegador, backend y persistencia.
3. Abre `web.whatsapp.com` real con el perfil persistente.
4. Busca automáticamente `CLUB HIPICO TRIPLE CROWN`, incluso si está archivado.
5. Toma el historial visible inicial como baseline: no se reinterpreta como mensajes nuevos.
6. Desde ese momento observa únicamente mensajes fuente nuevos.
7. Las respuestas simuladas aparecen solamente en `Control hípico lab`; el launcher escribe el nombre en UTF-8 sin BOM para evitar `hÃ­pico`.

El procedimiento completo de despliegue, rollback y verificación está en
`docs/hipico/CONTROL_HIPICO_V140_PRODUCTION_RUNBOOK.md`.

## Política de aprendizaje

Los mensajes reales no cambian automáticamente los pesos de un modelo ni se convierten directamente en reglas de producción. Se guardan como dataset shadow auditable: mensaje → clasificación → entidades → predicción → resultado/revisión. Solo patrones revisados y consistentes pueden promoverse después a reglas, ejemplos o conocimiento versionado.

Esto permite medir falsos positivos, falsos negativos, ambigüedades, errores de monto/caballo/carrera y comportamiento después del cierre antes de pasar a `assist/manual approval` y, mucho más adelante, a automatización limitada.
