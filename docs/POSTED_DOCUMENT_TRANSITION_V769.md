# #769 — intención segura para documentos emitidos/posteados

Política pura `posted-document-transition.mjs` define estados draft → issued → posted → reversed o cancel en draft/issued. Para emitir exige número de la autoridad canónica **#762**, snapshot precio/IVA congelado; para postear/revertir exige confirmación servidor del periodo abierto. Reverse/cancel requiere razón y effectKey para usar en idempotencia downstream. Un documento posteado no puede regresar a draft/issued ni cancelarse mediante mutación directa.

Las banderas `sequenceIssuedByServer`, `snapshotLocked`, `periodOpenVerified` son **precondiciones suministradas exclusivamente por el servicio backend canónico**, no claims que se deban aceptar desde API/browser. El resultado del helper `persisted:false`, `ledgerAuthorized:false`; un servicio de dominio deberá mantener la transacción, CAS, auditoría y creación de documento de reverso. Ningún número ni asiento se crea aquí.

`node --test tests/posted_document_transition_v769.test.mjs`. Falta integración #637/#762, actual tax snapshots versionados, DB17 tenant A/B, API/browser tests de nota fiscal y ledger, por tanto #769 OPEN/PARTIAL. Rollback simple 3 archivos, no DDL. SOURCE_REUSE=NONE.
