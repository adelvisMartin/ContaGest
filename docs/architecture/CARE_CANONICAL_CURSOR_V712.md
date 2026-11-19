# #712 — Un cursor canónico para paginación de historia clínica

Baseline `main@5cbd858803275f3033019a8977b38fb772333c71` (19-11-2026). Subalcance #822: expediente longitudinal y timeline; la autoridad permanece en `CareClinicalFact` y las tablas clínicas Core Care existentes.

## Defecto y cambio mínimo
El decodificador `decodeCareTimelineCursor` comprobaba longitud y caracteres, pero Node `Buffer.from(token, 'base64url')` admite sextetos finales no canónicos que pueden decodificar los mismos bytes. JSON también admite orden de propiedades alternativo y claves duplicadas. Esto permitía múltiples representaciones de un mismo token opaco de paginación. No implica por sí solo fuga cross-tenant: la consulta SQL existente mantiene predicates de tenant/paciente.

Ahora el decodificador comprueba `decoded.toString('base64url')===token`, valida estructura Zod y exige `encodeCareTimelineCursor(parsed)===token`. Los cursores emitidos por el propio backend permanecen compatibles; formatos no canónicos reciben HTTP 422 mediante `HttpError`. El orden y filtros SQL no se alteran; no se modifica el esquema de datos ni la seguridad de profesionales.

## Regresiones y límite
Se añadieron dos tests al unitario `care-longitudinal-policy.test.ts` (orden alternativo, clave duplicada, últimos bits base64url) y se conectó el unitario al comando backend test; contrato del flujo Care en `tests/care_longitudinal_persistence_v822.test.mjs`. El test fuente no certifica la ejecución.

**Pendiente**: Node22 `npm ci`, typecheck/build/Node tests, PostgreSQL 17 real aislado tenant A/B, API pagination E2E, UI teclado/foco y móviles, auditoría clínica, CI exact-SHA. El resto de #712 — hospitalización, prescripción/farmacia, imagen, billing, portal y interoperabilidad — sigue OPEN.

**Riesgo**: tokens externos previamente generados en formatos no canónicos dejan de funcionar; los cursores públicos creados por este mismo backend no cambian. Rollback por revert de rama, sin migración ni borrado.
