# Guía de estudio — Hípico #112: spool durable, quarantine y replay

## 1. Qué problema resuelve

Un Bridge que recibe mensajes y llama servicios externos puede fallar después de capturar el mensaje pero antes de completar su efecto. Si sólo guarda JSON sin lifecycle formal, un restart puede perder trabajo, duplicarlo o volver a enviar historia antigua.

El patrón de #112 convierte la cola local en un **journal operacional** con estados explícitos y recuperación controlada.

## 2. Conceptos clave

### Idempotencia

Dos observaciones del mismo evento deben producir la misma identidad de trabajo. En este Bridge la identidad deriva de `kind + key`, por ejemplo `backend-event + channelKey|externalMessageId`.

La regla práctica es:

```text
mismo evento -> mismo recordId -> no crear un segundo efecto
```

### Estados

- `queued`: listo para intentar entrega.
- `failed`: falló de forma reintentable y tiene `nextAttemptAt`.
- `sent`: efecto normal confirmado.
- `quarantined`: no es seguro reintentarlo automáticamente.
- `expired`: superó la edad permitida.
- `replayed`: entrega exitosa que provino de una reactivación manual.

Los estados terminales evitan que un duplicado vuelva a activar trabajo ya confirmado.

### Backoff + jitter

Reintentar inmediatamente muchas veces puede empeorar una caída. El backoff aumenta el tiempo entre intentos; el jitter evita que múltiples procesos reintenten exactamente al mismo tiempo.

### Quarantine

Quarantine significa “preservar para inspección, pero no ejecutar automáticamente”. Es apropiado para:

- formatos legacy;
- parser incompatible;
- JSON corrupto recuperable como evidencia;
- errores no reintentables;
- retry budget agotado.

### Replay seguro

Replay no debe ser sinónimo de “reenviar todo”. El flujo seguro es:

```text
seleccionar rango/estado
-> dry-run
-> revisar destino y cantidad
-> confirmar count exacto
-> reencolar
-> runtime normal aplica gates
-> estado replayed
```

## 3. Por qué el spool v1 era insuficiente

El runtime histórico escribía directamente en `spool-events` y `spool-lab-mirror`, actualizaba attempts en el mismo JSON y eliminaba el archivo al terminar. El PR #169 había creado el contrato v2, pero mientras `index.mjs` siguiera usando ese lifecycle v1 la solución no estaba conectada al flujo productivo.

La lección es importante: **tener una implementación correcta en un archivo no significa que la aplicación la esté usando**.

## 4. Flujo v2 conectado

### Backend

```text
mensaje fuente
-> queueBackendEvent()
-> queued/failed
-> flushBackend()
-> backendPost()
-> sent
```

### LAB

```text
mirror calculado
-> queueLabMirror()
-> queued/failed
-> flushLab()
-> assertCurrentLabIdentity()
-> sendTextInCurrentLab()
-> sent
```

El SOURCE real no tiene función equivalente de envío.

## 5. Crash windows

Piensa en estas ventanas:

1. crash antes de persistir: el mensaje no debe marcarse `seen`;
2. crash después de persistir pero antes de enviar: queda `queued`;
3. crash después de fallo: queda `failed` con siguiente intento;
4. crash después de efecto externo pero antes de mover a terminal: la idempotencia externa + detección de copia terminal reducen duplicación; para LAB también existe mirror tag visible;
5. crash durante upgrade: la cola legacy se archiva/quarantina y nunca se dispara sola.

## 6. Disk-full

`ENOSPC` es un fallo de integridad, no un warning cosmético. Si no se puede persistir el trabajo durable, el sistema debe fallar observablemente y no marcar el mensaje como procesado.

## 7. Seguridad del replay

El replay de LAB exige que el destino coincida con el `labChannelKey`. El CLI sólo reencola; el runtime live todavía debe abrir el LAB exacto y validar el ID pinneado antes de escribir.

Esto aplica defensa en profundidad:

```text
CLI destination check
+
record identity
+
runtime LAB identity
+
source has no send path
```

## 8. Qué probar

Casos mínimos para dominar este patrón:

- duplicate event;
- restart con queued;
- retry antes/después de `nextAttemptAt`;
- max attempts;
- 401/4xx no seguro;
- 429 con Retry-After;
- parser version mismatch;
- corrupt JSON;
- legacy queue tras upgrade;
- disk full;
- replay con destino incorrecto;
- replay con count cambiado;
- replay correcto;
- crash antes/después del efecto.

## 9. Diferencia entre IMPLEMENTED y VERIFIED

`IMPLEMENTED`: `index.mjs` está cableado al journal v2.

`VERIFIED`: además existe ejecución del SHA candidato que demuestra el comportamiento esperado en el entorno requerido.

Los tests Node aislados dan evidencia fuerte del lifecycle puro. No sustituyen un drill físico con la sesión real de WhatsApp/Chrome cuando el criterio de cierre lo exige.

## 10. Preguntas de repaso

1. ¿Por qué un archivo JSON “pendiente” no constituye por sí solo un journal durable?
2. ¿Qué diferencia hay entre retry e idempotencia?
3. ¿Por qué un spool legacy debe entrar en quarantine tras un upgrade?
4. ¿Por qué el replay sólo reencola y no envía directamente?
5. ¿Qué debe ocurrir si falla la persistencia antes de `rememberSeen()`?
6. ¿Qué riesgo cubre el `expected-count`?
7. ¿Qué ventaja tiene separar `sent` de `replayed`?
8. ¿Qué evidencia adicional hace falta para afirmar que el Bridge real sobrevivió a crash/restart?
