# ERP #157 · Contratos de procesos pesados

Este documento forma parte del gate reproducible de rendimiento/capacidad. No autoriza datos productivos ni sustituye evidencia medida.

## Importación

- `dry-run` es reversible por definición: sólo staging, sin escrituras de negocio.
- `commit` es una operación transaccional e idempotente. Una vez que el servidor inicia la transacción no existe una API de cancelación parcial; la operación debe terminar completa o hacer rollback.
- Un cierre del navegador no se interpreta como orden de cancelación del commit.
- Errores de validación se expresan como batch inválido y bloquean el commit.

## Exportación CSV/XLSX/PDF

- La generación actual es request/response síncrona y no expone un endpoint de cancelación server-side.
- El cliente puede abortar la descarga, pero eso no constituye una garantía de interrupción del trabajo ya iniciado en el servidor.
- Payload inválido debe fallar de forma controlada antes de producir un documento válido.
- Los límites de tamaño y memoria deben verificarse con datasets QA/sintéticos antes de ampliar capacidad.

## Reportes

- Los reportes actuales son request/response y no mantienen un job cancelable persistente.
- Una ruta de reporte no soportada debe responder con error HTTP controlado; no debe degradar el proceso general.
- Si en el futuro un reporte pasa a background job, deberá introducir estados `queued/running/completed/failed/cancelled` e idempotencia propia antes de declarar cancelación soportada.

## Regla del gate

El outcome `cancellation-or-explicit-non-cancellable-contract` sólo puede marcarse `MEASURED` cuando:

1. el flujo `success` fue ejecutado;
2. el flujo `controlled-error` fue ejecutado;
3. este contrato sigue presente y los tests de #157 confirman que no se anuncia una API de cancelación inexistente.

No se permite convertir un timeout, una excepción o un workflow no ejecutado en PASS.
