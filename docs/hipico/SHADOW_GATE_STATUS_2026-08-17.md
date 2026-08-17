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

## Esquema canonico de laboratorio

La base ya contenia las tablas canónicas de Hípico para mensajes, eventos operativos, reconciliaciones, evaluaciones shadow, ledger y outbox. Para este gate se configuro un canal separado:

```text
group_key    = control-hipico-lab
label        = Control hípico lab
channel_type = web_bridge
status       = active
mode         = shadow_only
auto_send    = false
```

El dual-write del PR #64 utiliza solo:

- `hipico_messages`;
- `hipico_operation_events` con `event_state=pending`;
- `hipico_shadow_evaluations` con `match_status=pending`.

No escribe `hipico_ledger_entries` ni `hipico_outbox` operativo.

Se valido el contrato SQL real dentro de una transaccion y se hizo `ROLLBACK`: durante la transaccion existieron exactamente 1 mensaje canonico, 1 evento operativo, 1 evaluacion shadow y 1 outbox de compatibilidad; despues del rollback quedaron 0 filas de esa prueba.

## Gate ejecutable de la rama

Para no depender de una afirmacion basada solo en compilacion, se ejecuto temporalmente el gate Hípico dentro de un preview de Vercel. Resultado:

```text
hipico-operational-classifier.test.ts + hipico-shadow-projection.test.ts
9 tests / 9 PASS / 0 FAIL

hipico_real_operativa_shadow_contract.test.mjs
7 tests / 7 PASS / 0 FAIL
```

El hook temporal se retiro despues de obtener la evidencia para no acoplar permanentemente el release de ContaGest ERP al release de Control Hípico. Queda disponible el comando independiente:

```text
npm run test:hipico
```

## Hallazgo corregido en esta rama

`Cierra carrera 4` se clasificaba como `conversation` porque el clasificador anterior solo cubria `cierre/cerrado`. La nueva clasificacion operacional cubre `cierra`, `cerrar`, `cerramos`, `cierren`, `no va mas`, `no mas jugadas`, `carrera cerrada`, `cerrado cerrado` y `fin de carrera`, manteniendo `autoEligible=false`.

La misma rama agrega extraccion estructurada de ofertas, montos, caballo, tipo de jugada, cierre, pizarra, disponibles y liquidacion, ademas de una proyeccion RC1-compatible de emparejamientos estrictamente de solo lectura.

## Siguiente gate

Ejecutar `WHATSAPP_REAL_OPERATIONS_SHADOW_QA.md` contra produccion **despues de aprobar y mergear PR #64**. Produccion conserva el clasificador anterior mientras el PR siga abierto. El criterio sigue siendo observacion, persistencia y concordancia; no se habilita envio ni ejecucion de operaciones.
