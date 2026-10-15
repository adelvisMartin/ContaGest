# #658 · Fase 1: invariantes de clasificación de ciclo de vida

Este incremento **separado del PR #1006** aporta un test de contrato de fuente
sin modificar servicios, consultas, migraciones ni datos.

## Autoridades y excepciones

- Fuente versionada: `docs/data-lifecycle/entity-retention-matrix.v1.json` y #562.
- Registro runtime: `PROTECTED_ENTITIES` y `PURGE_ADAPTER_ENTITIES`.
- AuditLog, LedgerEntry, FiscalDocument y FiscalCloseEvidence: clasificación
  `immutable` / `purgeable:false`; nunca autorizar borrado genérico.
- ClinicalMediaObject: `immutable`; CarePatient: `soft_delete`. El
  tratamiento clínico requiere su autoridad separada, no una purga SQL.
- AnalyticsEvent, ImportBatch, NotificationLog y AddressGeocode: adapter
  explícito y retención versionada.
- MediaObject no entra en la allowlist de purga SQL genérica.

## Verificación y límites

`node --test tests/data_lifecycle_v562_contract.test.mjs` debe fallar si
desaparece una clase protegida, cambia semántica, se habilita purge de
registros inmuebles, aparecen duplicados o se aparta el runtime del catálogo.

Es una comprobación estructural. **No demuestra PostgreSQL 17, aislación
real A/B, jobs crash-safe, export de payload ni restore**. Esos criterios
permanecen en el issue #658 y el PR #1006; no cerrar el issue por esta fase.
El QA manual del propietario queda reservado para la fase final.

Rollback: revertir exclusivamente este test y esta documentación. No cambia
comportamiento productivo, esquema ni permisos. No se desactivan checks.
