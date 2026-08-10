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

### 1. Meta Cloud API
Preferido cuando el canal objetivo esté soportado oficialmente y entregue los eventos necesarios mediante webhook. Es el único conector que puede considerarse cloud-autónomo sin depender de un teléfono encendido, siempre que el escenario real esté soportado por la cuenta y el producto de Meta.

### 2. Android Companion
Contingencia para escenarios donde el canal real no tenga una API oficial suficiente. Debe tratarse como puente operacional, no como una supuesta API de WhatsApp. Cualquier capacidad de lectura/respuesta debe probarse en el teléfono real, documentar sus limitaciones y no afirmar captura completa si Android/WhatsApp no exponen un evento.

### 3. Importación / Compartir / Exportación
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
La pérdida de cobertura del teléfono no debe detener las funciones locales de Hípico Control. Si el conector cloud permanece operativo, el backend puede continuar recibiendo y clasificando mensajes independientemente del teléfono. Si el conector depende del teléfono, la app conserva la operación local y marca que la escucha del canal está interrumpida; al recuperar conectividad debe reconciliar lo faltante antes de afirmar que la jornada está completa.

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

1. captura continua del canal real;
2. deduplicación 100 % sobre reentregas conocidas;
3. recuperación tras interrupción o señal explícita de hueco;
4. cero apuestas creadas por mensajes de conversación;
5. cero mensajes posteriores al cierre aceptados automáticamente;
6. trazabilidad desde la apuesta hasta el mensaje fuente;
7. outbox sin respuestas duplicadas;
8. conciliación final reproducible al ejecutar el mismo corpus nuevamente.

## Principio central
**Persistir primero, decidir después.** Un mensaje recibido nunca debe perderse porque el parser falle, el dispositivo se reinicie o la conexión con el backend se interrumpa durante el procesamiento.
