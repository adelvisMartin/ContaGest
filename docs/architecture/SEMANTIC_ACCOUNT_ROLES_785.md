# #785 · Semantic Account Role Mappings — incremento parcial

Esta migración introduce **una asociación por tenant y rol semántico** hacia cuentas reales de `ChartAccount`; no duplica el catálogo, no contabiliza, no modifica el histórico ni altera los servicios de ledger. `ChartAccount` continúa definiendo naturaleza y capacidad de posting. La FK compuesta evita enlazar cuentas de otro tenant. Los permisos de lectura/escritura siguen `accounting.view` y `accounting.post`. El vínculo se crea una sola vez (no update/delete en este incremento), y la auditoría de creación forma parte de la misma transacción.

`GET /chart-accounts/role-mappings` muestra los vínculos; `POST /chart-accounts/role-mappings` permite registrar un rol y código existentes, con naturaleza opcional para verificar correspondencia. Nunca confundir permiso de mapear con autorización de asiento. Deben añadirse editado versionado, resolver en servicios financieros, migración del código rígido, validación postable al **momento** de posting, UI de administración y PostgreSQL 17 tenant A/B E2E antes del DoD.

El SQL aplica FORCE RLS y niega acceso hasta que el sidecar canónico de #845 instale políticas de tenant. Ninguna operación prueba ni modifica producción. **NO_MERGE** hasta from-zero/upgrade y verificación contable completa; rollback por roll-forward si ya hubo datos.
