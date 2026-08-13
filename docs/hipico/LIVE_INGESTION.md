# Hípico Control — Escucha en vivo y recuperación

## Propósito
Durante una jornada real, Hípico Control no puede depender de que el operador copie o exporte el chat manualmente. Debe mantener una fuente de ingreso activa que capture los mensajes nuevos, los persista y permita reconstruir exactamente qué ocurrió.

Los chats históricos suministrados durante desarrollo se usan como **golden corpus** para:
- entrenar reglas y diccionarios operativos;
- reproducir jornadas completas;
- medir falsos positivos/negativos;
- probar deduplicación;
- probar cierre, llegada, liquidación y conciliación;
- mejorar el sistema antes de la operación real.

No sustituyen el listener de producción.

## Arquitectura

```text
Canal WhatsApp / conector
        │
        ▼
Live Listener
        │
        ├─ valida identidad del canal
        ├─ conserva ID/timestamp/remitente/cita
        ├─ calcula fallback hash si falta ID estable
        ▼
hipico_messages  ← persistencia antes de interpretar
        │
        ▼
Classifier / Correlator
        │
        ├─ oferta
        ├─ contraoferta
        ├─ confirmación
        ├─ cierre
        ├─ plano
        ├─ llegada
        ├─ liquidación
        ├─ disponibles
        ├─ conversación
        └─ ambiguo
        ▼
hipico_operation_events
        │
        ├─ Operations Inbox
        ├─ motor de apuestas
        ├─ ledger
        └─ outbox de respuestas
```

## Conectores

### 1. WhatsApp Web Group Bridge — primera ruta de prueba del grupo
Para validar **un grupo real de WhatsApp desde el primer día**, Hípico Control incluye `tools/hipico-whatsapp-bridge`, basado en una sesión web vinculada a una cuenta normal que pertenece al grupo. Escucha `message_create`, conserva el ID del mensaje, remitente, cita y timestamp, guarda primero en spool local y luego envía al backend de Vercel/Supabase.

La prueba E2E usa `/hipico_status`: el mensaje debe entrar desde el grupo, persistirse en backend y producir una respuesta autorizada en ese mismo grupo. Esto demuestra grupo → listener → backend → Supabase → respuesta al grupo.

Este conector usa automatización de WhatsApp Web y **no es una API oficial de Meta**. Puede requerir mantenimiento por cambios del cliente web y existe riesgo de restricciones de cuenta. Por eso se valida primero en un grupo controlado, se recomienda una cuenta dedicada para producción y se conserva una segunda implementación intercambiable (por ejemplo WAHA/WPPConnect) detrás de la misma interfaz de conector.

### 2. Meta Cloud API
Preferido para mensajería individual y para cualquier canal que Meta soporte oficialmente mediante webhook. La documentación oficial actual de Cloud API sigue usando `recipient_type: individual`; por tanto no se utilizará como supuesto listener de un grupo normal hasta que Meta documente y habilite explícitamente ese escenario para la cuenta/canal real.

### 3. Android Companion
Contingencia cuando la máquina bridge no esté disponible. Debe tratarse como puente operacional, no como una supuesta API de WhatsApp. Cualquier capacidad de lectura/respuesta debe probarse en el teléfono real, documentar sus limitaciones y no afirmar captura completa si Android/WhatsApp no exponen un evento.

### 4. Importación / Compartir / Exportación
Respaldo y recuperación. Sirve para reconstruir huecos, reconciliar y alimentar el corpus. No es el modo principal de trabajo cuando se declara automatización en vivo.

## Regla de honestidad operacional
La interfaz debe mostrar qué nivel de captura existe realmente:

- **En vivo**: eventos recibidos directamente del conector activo.
- **Retrasado**: listener activo pero con backlog o retraso.
- **Sin conexión**: no se están recibiendo mensajes nuevos del origen.
- **Recuperando**: se está reconstruyendo desde el último ID/cursor conocido.
- **Hueco detectado**: existe un intervalo que no puede demostrarse completo.

Nunca se mostrará “Sincronizado” si no existe evidencia de continuidad.

## Continuidad cuando el teléfono del operador no tiene cobertura
La pérdida de cobertura del teléfono no debe detener las funciones locales de Hípico Control. Con Group Bridge, la escucha depende de la máquina donde vive la sesión vinculada y de su Internet, no de la cobertura del teléfono del operador. Si esa máquina continúa conectada, puede seguir leyendo y respondiendo al grupo aunque el teléfono del operador no tenga señal. Si el bridge cae, el sistema marca la interrupción y no afirma continuidad hasta reconciliar.

## Métricas de jornada
- mensajes observados;
- mensajes persistidos;
- duplicados descartados;
- ofertas detectadas;
- respuestas correlacionadas;
- casos ambiguos;
- mensajes tardíos posteriores al cierre;
- retraso máximo del listener;
- duración de interrupciones;
- huecos detectados;
- tasa de intervención humana;
- diferencias de conciliación.

## Gate de producción
No se activa el modo de respuesta automática general hasta cumplir en una jornada controlada:

1. captura continua del grupo real;
2. deduplicación 100 % sobre reentregas conocidas;
3. recuperación tras interrupción o señal explícita de hueco;
4. cero apuestas creadas por mensajes de conversación;
5. cero mensajes posteriores al cierre aceptados automáticamente;
6. trazabilidad desde la apuesta hasta el mensaje fuente;
7. outbox sin respuestas duplicadas;
8. conciliación final reproducible al ejecutar el mismo corpus nuevamente.

## Principio central
**Persistir primero, decidir después.** Un mensaje recibido nunca debe perderse porque el parser falle, el dispositivo se reinicie o la conexión con el backend se interrumpa durante el procesamiento.
