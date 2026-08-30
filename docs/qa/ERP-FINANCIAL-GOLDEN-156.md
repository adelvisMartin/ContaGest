# ERP Financial Golden Dataset #156

## Objetivo

Disponer de un conjunto pequeño, determinista y auditable que detecte regresiones monetarias antes de confiar en datasets reales.

## Datos deliberadamente sintéticos

`qa/fixtures/erp-financial-golden-v156.json` usa moneda `TEST` y marca `SYNTHETIC_TEST_ONLY`. El 16% incluido es un parámetro de prueba, no una declaración sobre BCV, SENIAT, IGTF, retenciones ni normativa vigente.

## Invariantes cubiertas

- cantidad y valor final de inventario;
- cuentas por cobrar y pagar;
- saldo y conciliación bancaria;
- neto de nómina;
- IVA sintético débito menos crédito;
- partida doble: débito total = crédito total;
- claves de idempotencia únicas y replay deduplicado;
- redondeo a centavos con algoritmo decimal determinista, sin depender de floats binarios.

## Evidencia

`CANDIDATE_SHA=<sha> node scripts/erp-financial-golden-v156.mjs`

genera `artifacts/qa/erp-financial-v156/<sha>/golden-summary.json` y `SHA256SUMS`.

## Alcance

Este golden dataset prueba lógica determinista. No sustituye pruebas contra PostgreSQL real, migraciones, RLS, datos históricos, tasas externas ni revisión contable/legal. Esas pruebas continúan en las suites `test:backend:*:real` y gates específicos.
