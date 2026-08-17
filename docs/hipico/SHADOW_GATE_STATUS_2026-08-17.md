# Control Hipico · Shadow gate status · 2026-08-17

## Evidencia verificada antes del corpus operativo

Pruebas realizadas en el grupo normal `Control hípico lab` con el Bridge oficial-web/Playwright:

- WhatsApp Web vinculado correctamente.
- Grupo objetivo reconocido.
- Historial visible tomado como baseline y no reprocesado.
- Mensajes nuevos enviados a `/api/v1/hipico-bot/bridge/events` con HTTP 202.
- Persistencia real en PostgreSQL despues de aplicar la migracion `0014_v1126_hipico_bot`.
- `HipicoWebhookEvent.status=classified`.
- `HipicoBotOutbox.targetType=group_bridge` y `status=shadow`.
- Reinicio de Bridge/Chrome con recuperacion de sesion sin QR nuevo.
- Dos participantes diferenciados por remitente.
- Corte/restablecimiento de Internet con recuperacion y entrega posterior.
- Dos mensajes manuales con igual texto y distintos IDs se conservaron como eventos distintos, correctamente.
- Reentrega transaccional del mismo provider-message ID produjo una sola fila; prueba revertida con ROLLBACK.
- Ninguna respuesta automatica al grupo.
- Ninguna mutacion monetaria, de carrera, resultado o liquidacion.

## Baseline PostgreSQL no destructivo

Antes de iniciar el corpus de operativa real se registro esta linea base, sin borrar las pruebas anteriores:

```text
HipicoWebhookEvent = 6
HipicoBotOutbox    = 6
last_event_at      = 2026-08-17 04:58:14.799 UTC
```

Las filas anteriores al baseline corresponden a las pruebas de transporte/persistencia. El corpus operativo debe medirse por filas posteriores a `last_event_at`, evitando limpiar o manipular evidencia ya verificada.

## Hallazgo corregido en esta rama

`Cierra carrera 4` se clasificaba como `conversation` porque el clasificador anterior solo cubria `cierre/cerrado`. La nueva clasificacion operacional cubre `cierra`, `cerrar`, `cerramos`, `cierren`, `no va mas`, `no mas jugadas`, `carrera cerrada`, `cerrado cerrado` y `fin de carrera`, manteniendo `autoEligible=false`.

La misma rama agrega extraccion estructurada de ofertas, montos, caballo, tipo de jugada, cierre, pizarra, disponibles y liquidacion, ademas de una proyeccion RC1-compatible de emparejamientos que es estrictamente de solo lectura.

## Siguiente gate

Ejecutar `WHATSAPP_REAL_OPERATIONS_SHADOW_QA.md` contra produccion **despues de aprobar y mergear PR #64**. Produccion conserva el clasificador anterior mientras el PR siga abierto. El criterio sigue siendo observacion y persistencia; no se habilita envio ni ejecucion de operaciones.
