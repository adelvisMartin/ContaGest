# 8/51 · Libro Diario React Cg/MUI

## Objetivo

Migrar `contabilidad` / `LedgerPage` al renderer React canónico sin alterar doble partida, persistencia ni salidas del libro.

## Contratos preservados

- cálculo del libro: `calculateLedger`;
- sincronización: `SupabaseSyncService.pullLedger`;
- documento balanceado de dos líneas: `lineA` + `lineB`;
- persistencia de ambas líneas mediante `createLedgerEntry`;
- fallback local conserva ambas líneas y registra `create-balanced-document-local`;
- cuenta principal y contrapartida no pueden coincidir;
- CSV del diario;
- vista imprimible del libro con escaping de contenido.

## UI

Formulario, preview, plantillas, métricas, estado balanceado/descuadrado y tabla pasan a React/Cg*/MUI con un único root. No se añade borrado de asientos ni se modifica authority de posting/reversos.

## QA

Source contract/audit requerido. Browser 360/390/430/768/1366 permanece `NOT_EXECUTED` mientras #134 bloquee runners.
