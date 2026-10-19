# #774 · Perfil tributario candidato DRAFT

`Tenant.rif` sigue siendo la autoridad de identidad fiscal. Al capturar una versión del perfil, el backend obtiene el RIF del tenant autenticado, persiste una copia histórica y registra clasificaciones/jurisdicciones/actividades **declaradas por operador**, con fuente/hash aportados por él. Ninguna clasificación declarada se presenta como norma vigente ni dispara cálculos; el estado de todas las versiones es **DRAFT**.

El endpoint `GET /fiscal/taxpayer-profiles` exige `fiscal.read` y el POST exige `fiscal.close`; las rutas se montan sobre el router fiscal existente, que determina el tenant en servidor. Las capturas son append-only y versionadas mediante lock transaccional del tenant, con audit log en la misma transacción. FORCE RLS y FK tenant. No se actualiza `Tenant.rif`, no se altera un documento posteado ni se cambia selección de reglas.

Bloqueos: conectarlo a fuente legal verificada de #751, aprobación/supersession sin ambigüedad de vigencias, calendario de obligaciones, UI, fiscal snapshots y PG17 from-zero/upgrade, RLS tenant A/B/permission matriz y QA E2E. **NO_MERGE / NO_DOD** mientras se desconozca evidencia de PostgreSQL 17 y no se completen esos contratos.
