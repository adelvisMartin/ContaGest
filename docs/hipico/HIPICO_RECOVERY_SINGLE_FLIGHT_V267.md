# #267 — Single-flight de recuperación de contraseña Hípico

## Problema y alcance

La PWA ya ofrece «¿Olvidaste tu contraseña?» y solicita el reset a Supabase Auth. El control `submit.disabled` no bastaba ante dos eventos de envío concurrentes (eventos sintéticos, colas o doble activación): ambos podían iniciar `signOut` y competir por `PUT /auth/v1/user` utilizando el mismo token recovery. Además, `readRecoveryContext` almacenaba en memoria la descripción arbitraria del proveedor, aunque la UI solo mostrara un mensaje genérico.

Este incremento **corrige esas dos brechas reales del cliente ya existente**, sin crear una autoridad de contraseñas nueva, modificar Auth de Supabase, almacenar credenciales ni actuar sobre identidades reales.

## Implementación

- `recoveryUpdateInFlight` protege el tramo completo desde `signOut()` previo a reautenticación hasta `PUT /auth/v1/user` y el RPC opcional de registro de cambio. El lock se libera en `finally` incluso si falla la red, `signOut` o el RPC.
- Si el formulario recibe otro `submit` mientras la primera solicitud está pendiente, `handleNewPassword` lo ignora, evitando petición duplicada y un toast falso.
- Un PUT correcto consume **inmediatamente** `recoveryAccessToken` antes del RPC opcional. Un PUT 401/403 (enlace caducado/inválido) también revoca el token; errores de red/5xx conservan la capacidad para un reintento explícito.
- `readRecoveryContext` borra cualquier token anterior antes de evaluar el callback nuevo. Todos los parámetros/fragmentos sensibles se eliminan de la URL; la memoria solo recibe `INVALID_RECOVERY_LINK` en fallos, nunca `error_description` con correos, tokens o identificadores privados.
- Se mantienen el mínimo de 10 caracteres, el consentimiento de actualización del usuario, `publishableKey` (sin service role), el redirect a la PWA, la limpieza de URL, y la reautenticación tras la actualización. No se modifica `auth.users`, `hipico_profiles`, `hipico_users` o el workspace desde el cliente.

## Evidencia disponible

- **6/6 PASS** con motor V8 ejecutando funciones reales `updateRecoveredPassword` y `parseError` extraídas byte por byte del archivo de rama, con network y sign-out simulados. Casos: éxito/consumo, carrera de dos envíos, rechazo 401, rate limit 429 sin lectura del body secreto, RPC posterior, contraseña inválida.
- Prueba negativa: al eliminar temporalmente la guarda `if (recoveryUpdateInFlight)`, dos operaciones `signOut` empezaron simultáneamente; con el fuente correcto, segundo envío devuelve `RECOVERY_ALREADY_IN_PROGRESS` y solo empieza uno.
- Añadido `tests/hipico_password_recovery_single_flight_v267.test.mjs` con **9 pruebas Node** que además inspeccionan limpieza de URLs/callbacks y token de 403, enrutadas por `scripts/hipico-root-contracts.mjs`. El archivo de tests pasó validación de sintaxis V8.
- El comando `node --test tests/hipico_password_recovery_single_flight_v267.test.mjs` contra checkout completo queda **NOT_EXECUTED** aquí por indisponibilidad de clonación GitHub. Tampoco se ejecutó el test completo de los contratos anteriores `tests/hipico_password_recovery_issue_267.test.mjs`.
- Real email REQUEST/COMPLETE, enlace/click, allowlist Supabase Redirect URLs, cuenta de prueba y perfil/owner_id/UUID, Chrome/Android/E2E y CI GitHub Actions exact-SHA quedan **NOT_EXECUTED / BLOCKED**. Se prohíbe describir esta prueba de V8 como una ejecución real en Supabase.

## QA requerido en checkout completo

```sh
node --check frontend/public/hipico-control/assets/js/password-recovery.js
node --test tests/hipico_password_recovery_issue_267.test.mjs tests/hipico_password_recovery_single_flight_v267.test.mjs
node --test tests/hipico_auth_recovery_e2e_v28.test.mjs tests/hipico_auth_recovery_stable_gate_v29.test.mjs
node scripts/hipico-root-contracts.mjs
```

La prueba con cuenta **dedicada** debe seguir la autoridad existente `scripts/hipico-auth-recovery-e2e-v28.mjs` y `docs/hipico/HIPICO_AUTH_RECOVERY_E2E.md`, nunca usar credenciales de usuarios reales. Evidencia `COMPLETE PASS` vinculada al SHA candidato es indispensable antes de #839 release.

**#267 permanece OPEN**: este PR no acredita el E2E externo. Rollback: revertir código de cliente y el test/doc; sin migración ni datos productivos. No se desactiva CI ni se considera QUEUED = PASS.
