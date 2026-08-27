# ADR — Importación transaccional por batch (#95)

## Estado

Aceptado para el candidato del issue #95.

## Problema

La pantalla histórica sólo ejecutaba preview y el backend consideraba válida prácticamente cualquier fila no vacía. Aplicar filas mediante CRUD independiente dejaría cargas parciales, reintentos duplicados y bypass de invariantes de dominio.

## Contrato

Cada importación sigue este lifecycle:

`archivo -> parse local -> normalize/validate server-side -> ImportBatch validated/invalid -> confirm checksum -> commit transaccional -> completed -> report`

El dry-run persiste staging administrativo, pero no escribe entidades de negocio.

## Tipos v1

- `clients`: clave `rif`.
- `suppliers`: clave `rif`.
- `inventory`: clave `sku`, sólo datos maestros de producto.
- `accounts`: clave `code`; valida cuentas padre.
- `payroll`: clave `idNumber`, importación de maestro de empleado, no cálculo de recibos.

## Duplicados

La política se fija al crear el batch y forma parte de su checksum:

- `update`: el duplicado se actualiza;
- `skip`: el duplicado se omite;
- `error`: el dry-run queda inválido.

Los registros no existentes siempre tienen acción `create`. Duplicados dentro del mismo archivo invalidan el batch.

## Atomicidad

El commit sólo acepta batches `validated`, sin filas rechazadas y dentro de una ventana de 24 horas. Reutiliza el checksum exacto del dry-run y ejecuta todas las filas dentro de una única transacción PostgreSQL. Una falla intermedia revierte el batch completo.

El batch se bloquea con `FOR UPDATE`; además se integra con la idempotencia de #92. Un retry de un batch completado reconstruye el resultado sin duplicar entidades.

## Inventario

La importación no acepta `stock` ni `reserved`. Esos saldos son operacionales y deben entrar por el workflow de movimientos de #94. Un producto importado se crea con stock/reserva cero.

## Contabilidad

Este pipeline importa plan de cuentas, no asientos. No existe vía de importación que modifique un asiento `posted` ni un período cerrado; el lifecycle de ledger de #91 permanece como autoridad.

## XLSX

El frontend admite la primera hoja `.xlsx` mediante un parser limitado y explícito del contenedor ZIP/XML de Office Open XML. No ejecuta macros ni fórmulas. Sólo extrae valores almacenados. También soporta CSV con comillas, TSV y JSON.

Límites: 5 MB y 5.000 filas por batch. No se aceptan `.xls`, `.xlsm`, macros ni SQL suministrado por usuario.

## Seguridad

- tenant obtenido exclusivamente de sesión/contexto;
- permiso `admin.manage` requerido en preview, consulta, commit y reportes;
- payload máximo de staging: 5 MB;
- nombres de archivo sanitizados;
- reportes CSV neutralizan celdas que comienzan por `=`, `+`, `-` o `@`;
- HTML/script se conserva como texto, nunca se ejecuta;
- AuditLog registra metadatos y conteos del batch, no filas ni PII de nómina;
- el staging validado expira lógicamente a las 24 horas.

## Retención

Mientras un batch está validado, `ImportBatch.payload` conserva las filas normalizadas necesarias para el commit. Al completar, el staging se sustituye por un reporte compacto de índice/clave/acción/resultado y deja de conservar el contenido completo de las filas.

No existe retención indefinida del archivo fuente: el archivo nunca se almacena en backend en este diseño.

## Recuperación

- `invalid`: corregir archivo/política y crear un nuevo dry-run;
- checksum distinto: no confirmar; crear nuevo dry-run;
- expirado: crear nuevo dry-run;
- falla de commit: la transacción revierte todo y el usuario puede volver a previsualizar/reintentar;
- `completed`: consultar/re-descargar reporte; no reejecutar efectos.