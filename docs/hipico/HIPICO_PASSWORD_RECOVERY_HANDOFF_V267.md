# #267 · Recuperación de contraseña — cierre de implementación, QA diferido

Este cambio consolida el flujo de recuperación existente, ya integrado previamente, con un límite de concurrencia **en la petición de correo** y un timeout abortable de 1 a 30 segundos (configurado por `CLOUD_CONFIG.requestTimeoutMs`). La segunda petición en vuelo no envía otro correo ni consume otro enlace. La salida por éxito, error 429, error del proveedor o timeout libera la exclusión en `finally`. La PWA conserva texto genérico anti-enumeración y no lee mensajes de error crudos.

**El código previamente integrado se preserva:** enlace «¿Olvidaste tu contraseña?», POST `/auth/v1/recover` con `publishableKey` y redirect a `/hipico-control/`, callback `type=recovery`, eliminación de tokens en URL, PUT `/auth/v1/user`, contraseña mínima de 10 caracteres y confirmación, token temporal únicamente en memoria, rechazo de carreras y `signOut` obligatorio antes del cambio. No se altera `auth.users`, identidad UUID, `hipico_profiles`, `hipico_users` ni workspace. No hay service_role ni cambios SQL.

**Validación de código pendiente (no declarada PASS):**

```sh
node --check frontend/public/hipico-control/assets/js/password-recovery.js
node --test tests/hipico_password_recovery_issue_267.test.mjs tests/hipico_password_recovery_single_flight_v267.test.mjs tests/hipico_password_recovery_request_guard_v267.test.mjs
node --test tests/hipico_auth_recovery_e2e_v28.test.mjs tests/hipico_auth_recovery_stable_gate_v29.test.mjs
```

**QA de entrega explícitamente diferido por el propietario (21/10/2026):** confirmar configuración de Redirect URLs, recepción/click del correo real, contraseña modificada, reautenticación, conservación del UUID/owner_id/perfil/workspace y evidencias COMPLETE PASS exact-SHA sobre **cuenta desechable dedicada** mediante `Hípico Auth Recovery E2E v28`. La fuente de la puerta final sigue en issue #839 y `docs/hipico/HIPICO_AUTH_RECOVERY_E2E.md`. Un ticket de implementación cerrado por decisión del propietario **no implica release PASS ni sustituye el gate #839**.

Rollback: revertir este cambio de cliente/test/documento, sin tocar Auth/DB ni cuentas reales.
