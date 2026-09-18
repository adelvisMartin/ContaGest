# 7/51 · Bancos y conciliación React Cg/MUI

## Objetivo

Migrar `bancos` a React sin reducir el flujo financiero existente ni alterar autoridad backend.

## Contratos preservados

Tesorería:
- summary, cuentas, movimientos, conciliación simple, reverso y corrección mediante `BankingService`.

Conciliación:
- lines/imports/models/closing balance;
- candidatos + historial;
- matching exacto con centavos enteros;
- write-off auditable con `approvalRequestId`/maker-checker;
- reverso de conciliación;
- modelos versionados;
- importación CSV/OFX/QFX/CAMT con provenance;
- export CSV con protección anti-formula.

## UI

La ruta usa un único React root y Cg*/MUI. Filtros, formularios, candidatos, modelos, historial e importación se gestionan declarativamente. La navegación por teclado j/k/flechas/Enter se conserva dentro del workspace de conciliación.

## Nota URL

El servicio URL canónico no admite actualmente `reconAccount/reconStatus`; por ello esos dos filtros permanecen como estado local React en vez de fingir persistencia URL. `search/status` conservan su comportamiento visible de filtrado.

## QA

Source contract/audit requerido. Browser 360/390/430/768/1366 permanece `NOT_EXECUTED` mientras #134 bloquee runners.
