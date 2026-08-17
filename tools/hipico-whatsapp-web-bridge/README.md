# Control Hípico · WhatsApp Web Bridge v1.2.0

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

## Regla principal

**El grupo oficial nunca es un destino de envío en esta versión.** El runtime no contiene una ruta genérica para escribir en TRIPLE CROWN. Solo puede observar el grupo fuente y, cuando `HIPICO_LAB_SEND_ENABLED=true`, enviar la simulación a `Control hípico lab` después de verificar que el chat activo coincide exactamente con el nombre del LAB.

Las apuestas, cierres, resultados, saldos y liquidaciones reales siguen bloqueados. El backend continúa devolviendo `actions: []` y toda evidencia operativa queda en estado shadow/pending.

## Fuente oficial

La fuente se localiza por `HIPICO_SOURCE_GROUP_MATCH=CLUB HIPICO TRIPLE CROWN`. Se usa coincidencia parcial intencionalmente para tolerar el emoji o sufijos visuales del nombre real. Si el grupo está archivado, el Bridge intenta también la búsqueda global de WhatsApp Web; no es necesario desarchivarlo.

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
- Perfil persistente en `data/chrome-profile/`.
- IDs vistos del **grupo fuente** en `data/seen-source-message-ids.json`.
- Compatibilidad de lectura con el viejo `data/seen-message-ids.json` al actualizar desde v1.1.0.
- Spool de eventos entrantes en `data/spool-events/`.
- Spool independiente de simulaciones LAB en `data/spool-lab-mirror/`.
- Un evento fuente se persiste en backend antes de considerarse entregado.
- Si backend devuelve error/503, el evento permanece en spool y se reintenta.
- Después de intentar una simulación LAB, el Bridge vuelve siempre al grupo fuente.

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

1. Ejecuta `INICIAR-CONTROL-HIPICO-WHATSAPP.cmd`.
2. El setup valida Node, token/backend y Playwright.
3. Abre `web.whatsapp.com` real con el perfil persistente.
4. Busca automáticamente `CLUB HIPICO TRIPLE CROWN`, incluso si está archivado.
5. Toma el historial visible inicial como baseline: no se reinterpreta como mensajes nuevos.
6. Desde ese momento observa únicamente mensajes fuente nuevos.
7. Si aceptas habilitar el espejo LAB, las respuestas simuladas aparecen solamente en `Control hípico lab`.

## Política de aprendizaje

Los mensajes reales no cambian automáticamente los pesos de un modelo ni se convierten directamente en reglas de producción. Se guardan como dataset shadow auditable: mensaje → clasificación → entidades → predicción → resultado/revisión. Solo patrones revisados y consistentes pueden promoverse después a reglas, ejemplos o conocimiento versionado.

Esto permite medir falsos positivos, falsos negativos, ambigüedades, errores de monto/caballo/carrera y comportamiento después del cierre antes de pasar a `assist/manual approval` y, mucho más adelante, a automatización limitada.
