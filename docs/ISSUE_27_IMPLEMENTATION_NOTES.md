# Issue #27 — notas de implementación

## Causa raíz

La base v11.15 había introducido `platform.manage` y `Role.scope`, pero varias superficies seguían resolviendo autoridad global mediante consultas parciales al permiso y el login todavía trataba `Role.system=true` como señal de usuario interno. Un rol tenant administrado por el sistema podía, por esa semántica, omitir la validación de licencia aunque no fuera operador de plataforma.

## Corrección

La autorización global queda centralizada en `platformAccess.ts` y requiere permiso `platform.*`, scope `platform` y tenant interno. El login ya no consulta `Role.system` para decidir el bypass. La misma identidad se reutiliza en permisos, licencia, suscripción, aceptación legal y multiempresa.

La migración de normalización es reductora de privilegios: revoca bindings globales inválidos fuera del tenant interno y fortalece triggers para impedir su reintroducción. No inserta nuevos `RolePermission` ni `UserRole`.

## Compatibilidad

`Role.system` se conserva porque puede seguir siendo útil como metadata para roles administrados/no editables. La compatibilidad no implica autoridad: los tests crean deliberadamente un tenant admin con `system=true` y verifican que continúa siendo un usuario cliente sujeto a licencia y suscripción.

## Evidencia automatizable

El workflow `iam-platform-isolation-v27.yml` crea PostgreSQL 17 desechable, aplica todas las migraciones, ejecuta auditor estático, contratos Node, typecheck y el test HTTP/DB real, y guarda el log como artefacto.
