# ContaGest · mapa de obligaciones y controles de seguridad
Fecha de revisión: 2026-10-22. Alcance: PR #1281 y tickets #688, #985, #979, #638, #720.

> Esta es una matriz de ingeniería con fuentes comprobables, **no** una certificación jurídica ni una conclusión de cumplimiento regulatorio integral. La aplicación de las normas depende de la operación real y de las jurisdicciones donde se traten datos. No se han inspeccionado datos productivos ni credenciales.

## Fuentes legales revisadas (Venezuela)

1. **Constitución de la República Bolivariana de Venezuela, artículo 28**: acceso de las personas a información sobre sí mismas en registros oficiales o privados y conocimiento de sus usos y finalidad; actualización, rectificación o destrucción mediante el procedimiento aplicable. Texto: https://www.wipo.int/wipolex/es/legislation/details/3981
2. **Ley Especial contra los Delitos Informáticos, Gaceta Oficial 37.313 (2001)**, arts. **20, 21 y 22**: privacidad de datos de carácter personal, comunicaciones y revelación indebida. Fuentes: https://www.wipo.int/wipolex/es/legislation/details/10223 y https://sherloc.unodc.org/cld/es/v3/sherloc/legdb/legislationCollection.html?country=%22VEN%22&lng=es&title=%22Ley+Especial+Contra+los+Delitos+Inform%C3%A1ticos%22
3. **Constitución, artículo 60**: protección del honor, vida privada, intimidad, propia imagen, confidencialidad y reputación. Texto oficial transcrito en la fuente anterior.
4. En la investigación **no se verificó una ley venezolana general y unificada de protección de datos de aplicación horizontal que equivalga a GDPR**. No inventar «consentimientos GDPR obligatorios», plazos o sanciones concretos para ContaGest sin determinar la jurisdicción. La evaluación debe revisarse con asesoría legal local antes de declarar cumplimiento. Contexto: https://espaciopublico.ong/en-venezuela-se-regula-la-proteccion-de-datos-personales/ (análisis fechado 2025-01-28, no autoridad legislativa).

## Estándares y especificaciones técnicas revisadas

- **IETF RFC 9457 (julio 2023)**: *Problem Details for HTTP APIs*, sustituyó RFC 7807. Un error público no es un volcado de depuración; hay que evitar contenido sensible en \`type/title/status/detail/instance\` y extensiones. https://datatracker.ietf.org/doc/html/rfc9457
- **PostgreSQL 17, Row Security Policies (5.9)**: RLS complementa GRANT; propietarios de tabla y \`BYPASSRLS\` pueden eludir las políticas; \`FORCE ROW LEVEL SECURITY\` altera el comportamiento del propietario. https://www.postgresql.org/docs/17/ddl-rowsecurity.html
- **PostgreSQL 17, Privileges (5.8)**: \`GRANT\`, \`REVOKE\`, pertenencia a roles y propiedad determinan facultades reales; auditorías de grants deben verificar derechos efectivos, no solo la existencia de roles. https://www.postgresql.org/docs/17/ddl-priv.html
- **Supabase, RLS**: credenciales \`service_role\` que evitan RLS nunca deben llegar al navegador; el backend de clientes debe usar el rol dedicado sin \`BYPASSRLS\`. https://supabase.com/docs/guides/database/postgres/row-level-security

## Traducción a controles implementables y evidencias

| Riesgo y fuente | Ticket | Control exigido | Evidencia antes de cerrar |
| --- | --- | --- | --- |
| Acceso o uso indebido de datos (Constitución arts. 28/60, Ley art. 20) | #638 | Autorización por usuario y tenant, allowlists de escritura/consulta, rechazo de \`tenantId\` de cliente, evitar mass-assignment | PostgreSQL 17 efímero, tenants A/B, llamadas HTTP negativas y regresiones sin ampliación de permisos |
| Exposición de datos/secretos en errores (Ley arts. 20/22, RFC 9457 §5) | #979 | Redacción en objetos anidados, logs, telemetry y error envelope; no reflejar correos, URL firmadas ni credenciales; mantener campos RFC 9457 | Native tests, HTTP 4xx/5xx con sentinelas, logs/reintentos y respuesta HTTP, exact-SHA |
| Lectura/alteración por rol privilegiado (PostgreSQL RLS, Ley art. 20) | #720 | \`contagest_runtime\` sin roles BYPASSRLS, \`contagest_backup\` y \`contagest_monitor\` de menor privilegio, grants/policies/definers auditados y tenant-safe | Catálogo read-only exacto; smoke REAL del proceso desplegado, comprobar \`current_user\` y RLS; no usar producción para tests destructivos |
| Pérdida o manipulación de evidencias de recuperación (Ley art. 20, PostgreSQL privilegios) | #985 | Backup/restore/rollback aislados, nomenclatura efímera, manifest/hash e integridad, limpieza garantizada | Job PostgreSQL 17 con restore+rollback real; reporte de RPO/RTO si contrato lo exige, artefactos sin secretos |
| Exposición por releases incompletos (todos) | #688 | Build desde HEAD/config exactos, no sustituir errores de tests por «infraestructura», checks requeridos y deploy READY | Logs exact deployment/SHA, verificaciones del navegador y prueba post-deploy |

## Controles adicionales de privacidad operativa

- Implementar o documentar un canal de atención a solicitudes de acceso/corrección y políticas de retención proporcional; **no** automatizar borrados de documentos contables o fiscales sin identificar previamente sus deberes específicos de conservación.
- Definir responsables del tratamiento, finalidades y accesos administrativos; aplicar mínimo privilegio a soporte y usuarios internos.
- Registro de auditoría con datos minimizados y trazabilidad sin tokens/contraseñas; limitar permisos de consulta de logs.
- Cifrar secretos en tránsito y reposo y rotarlos mediante mecanismos del proveedor; no copiar valores de producción a artefactos CI.
- Pruebas A/B siempre con datos sintéticos y PostgreSQL 17 aislado; preservar limpieza al fallo. Inventario de terceros y transferencias internacionales **pendiente de análisis jurídico** por país.

## Estado de conformidad

**IMPLEMENTACIÓN Y VERIFICACIÓN INCOMPLETAS.** La existencia de aserciones fuente o evidencias históricas no acredita que los controles estén activos en el despliegue final. Esta matriz no declara que la empresa sea conforme con ninguna de las normas. #688/#720 siguen condicionados a READY y al smoke real; #985/#979/#638 conservan sus gates propios.
