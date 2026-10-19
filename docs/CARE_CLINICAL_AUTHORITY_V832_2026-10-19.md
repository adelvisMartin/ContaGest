# #832 · Boundary de escritura y firma clínica (incremento de seguridad)

Base: `origin/main@55e0706b55654f824f513aa5f51f2198b5f65ba0`.

## Comportamiento

- Registrar un profesional desde la API exige `health.manage` **y** `admin.manage`. La ficha creada queda sin `userId`: una matrícula textual ingresada en un formulario no verifica identidad profesional ni concede capacidad de firma. Los registros históricos con `userId` requieren revisión de credenciales y aprovisionamiento independiente.
- El POST genérico de encuentros para pacientes humanos sólo admite borradores. `ambulatory-visit` pertenece exclusivamente al workflow de cita. En el formulario humano, «Guardar» ahora guarda un borrador; no comunica una firma inexistente.
- La firma de una enmienda/tratamiento dental y la aceptación de un plan requieren que el usuario de sesión coincida con el profesional activo y matriculado asignado al encuentro. La comprobación forma parte de la transacción antes del UPDATE.
- La migración aditiva `20261019150000_care_direct_client_privileges_v832` revoca todo acceso de tabla `anon`, `authenticated` y `PUBLIC` a las tablas Care preexistentes. No altera la autoridad privilegiada de `contagest_runtime` ni `service_role` y no modifica datos. Las reglas RLS antiguas permanecen como defensa adicional.

## Deploy / no-go

**No desplegar ni fusionar este incremento hasta disponer de PostgreSQL17 real.** Los tests de contrato de Node no simulan grants, RLS, migración de actualización ni identidad Supabase.

Antes de habilitar el flujo: snapshot/backup; migraciones de una base vacía y de upgrade; reaplicar la sidecar autorizada `backend/scripts/runtime-rls-v845.mjs`; introspección de `has_table_privilege('authenticated', ...)` para SELECT/INSERT/UPDATE/DELETE (todos falsos) en cada tabla del listado; comprobación de `contagest_runtime` + contexto de tenant; negativos cruzados A/B, llamadas HTTP firmadas y pruebas browser. Verificar además que los perfiles históricos no estén autocertificados y establecer una autoridad verificable para nuevas asociaciones `CareProfessional.userId`.

El cambio de grants puede cortar clientes externos que accedían directamente a Supabase; migrar esos consumidores a rutas API con permisos antes del despliegue. En caso de incompatibilidad, restaurar snapshot/ajustar clientes mediante rollout controlado; **no** devolver DML al rol `authenticated` como rollback automático inseguro.

Este trabajo no completa #832: portal/consentimiento revocable, trazas de acceso a PHI, retención, exportación versionada y E2E permanecen fuera de este incremento. Los tickets #822, #824, #826 y #830 siguen sujetos a sus gates propios.
