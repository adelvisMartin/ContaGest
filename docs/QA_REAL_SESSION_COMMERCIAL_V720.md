# #720 — E2E comercial con identidad vinculada a sesión real

## Causa raíz / evidencia

El workflow `E2E comercial` (PostgreSQL 17 efímero) fallaba en 7 subtests de `qa/commercial-backend-real-v23.test.ts`: el primer negativo esperaba HTTP 403 de un usuario válido sin `platform.manage` y obtenía **401 `UNAUTHORIZED`**; las operaciones posteriores recibían 401 porque los JWT de prueba no llevaban una sesión `sid` vigente.

La causa estaba en la propia prueba: llamaba `signAccessToken(...)` sin crear la fila `UserSession` que ahora valida `requestContext`. **No** es admisible relajar el middleware ni aceptar sesiones sintéticas sin `sid`.

## Corrección

La prueba comercial reutiliza el `createRealBackendHarness` existente. Este verifica que la BD sea efímera/aislada y que el actor ya tenga `platform.manage`, crea `UserSession` real para admin y usuario restringido, firma el JWT ligado a cada sesión y elimina sus sesiones al terminar. Se preservan exactamente los E2E positivos y negativos: usuario no autorizado → 403; cliente → vendedor → suscripción → suspender/reactivar → pago → comisión → auditoría.

El teardown no elimina `AuditLog` (historia append-only). Las operaciones propias restantes se limpian en la base efímera, sin tocar ninguna base compartida. No hay bypass de auth, migración, nuevo secreto, nueva autoridad de usuario ni mocks permanentes.

El workflow mantiene `npm ci`, PostgreSQL 17 aislado, migraciones y seed, `typecheck`, pruebas reales y artefactos atribuidos al SHA exacto. El contrato nuevo comprueba que las sesiones siguen siendo obligatorias, que hay `INSERT UserSession` real y que la suite nunca llama directamente al firmador.

## Validación y cierre

`node --test tests/commercial_real_session_contract_v720.test.mjs` es una prueba contractual **ejecutable**; ejecutar además `npm run test:backend:commercial:real` contra PostgreSQL 17 aislado, `npm run typecheck` y CI exact-SHA antes del merge. La aprobación QA manual se registra por separado de las pruebas automatizadas. Este incremento de #720 no cierra toda la épica de seguridad de producción.
