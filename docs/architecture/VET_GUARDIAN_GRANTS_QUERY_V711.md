# #711 — Filtros del listado de permisos del portal veterinario

Baseline `main@5cbd858803275f3033019a8977b38fb772333c71`, 19 Nov 2026. Subalcance #810 / #820 retenido bajo owner #711.

## Estado y hallazgo
El endpoint `GET /guardian-portal/grants` ya exige `communications.manage`, obtiene `tenantId` del contexto autenticado y consulta únicamente pacientes `CarePatient.kind='animal'` del tenant. Los tokens de acceso no se incluyen en el listado. El portal veterinario público existente usa token SHA-256, expiración, scopes de datos y bloqueo durante la lectura.

La función de filtro `vetGuardianGrantsPatientId` validaba solo `Object.keys(query)` antes de acceder con `values.patientId`. Propiedades heredadas, no enumerables y Symbol podían quedar ocultas; un getter sobre `patientId` se ejecutaba durante el parseo. Aunque el contexto/SQL tenant previene un cambio de tenant por ese filtro, el parser no debía ejecutar código de un objeto no confiable ni aceptar claves clandestinas.

## Remediación localizada
Rechaza prototipos ajenos a Object/null, inspecciona todas las claves propias con `Reflect.ownKeys`, exige solo el descriptor **data** de `patientId` y valida el UUID sin invocar getters. La ruta y autorización de DB no cambian.

Se amplía `tests/vet_guardian_grant_query_v810.test.mjs` con casos de getter que lanzaría, prototype heredado, clave oculta, Symbol, Date/Map y objeto null-prototype válido. No se introduce otro portal, token de sesión ni authority de paciente.

## Validación y bloqueos
Source review no equivale a test: `node --test tests/vet_guardian_grant_query_v810.test.mjs`, npm ci, lint/typecheck/build, API/PG17 tenant A/B, navegador/pantalla móvil y CI exact SHA: **NOT_EXECUTED** hasta evidencia real. El resto de #711 (vacunas/certificados, hospitalización, farmacia, interoperabilidad y flujos clínicos end-to-end) permanece abierto.

Riesgo: rechaza objetos especiales/symbols no válidos que antes podían pasar al parser. Rollback: revertir rama, sin migraciones. No cambiar SOURCE Hípico ni permisos financieros.
