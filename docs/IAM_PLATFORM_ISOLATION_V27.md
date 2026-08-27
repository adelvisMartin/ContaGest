# IAM v27 — frontera tenant / plataforma

## Invariante de autorización

`Role.system` es únicamente metadata de ciclo de vida de un rol administrado por ContaGest. No identifica personal interno, no habilita la consola comercial y no permite omitir licencia, suscripción ni aceptación legal.

Una identidad de plataforma válida requiere simultáneamente:

1. `UserRole` del usuario solicitado;
2. `Role.scope = 'platform'`;
3. que el rol pertenezca al tenant interno con RIF `00000000`;
4. un `RolePermission` explícito para el permiso `platform.*` solicitado (`platform.manage` en la consola actual).

La función canónica es `backend/src/shared/identity/platformAccess.ts`. Los guardas de autenticación, RBAC, licencias, suscripciones, legal y tenant-switch no deben volver a implementar consultas parciales de `platform.manage`.

## Normalización de datos históricos

La migración `20260827043000_issue_27_platform_identity_normalization` es fail-closed:

- revoca bindings `platform.*` pertenecientes a tenants cliente;
- no crea permisos, `UserRole` ni `RolePermission` nuevos;
- fuerza `scope=tenant` fuera del tenant interno;
- conserva `scope=platform` dentro del tenant interno sólo cuando ya existe un permiso global explícito;
- bloquea por trigger futuros permisos `platform.*` en roles de cliente;
- bloquea mover un rol global a otro tenant mientras conserva permisos globales.

Para mantener bootstrap/seed reproducible, cuando una operación administrativa válida concede explícitamente un permiso `platform.*` a un rol del tenant interno, el trigger puede elevar únicamente su `scope` a `platform`. El permiso sigue siendo la acción autoritativa; `scope` por sí solo no concede acceso.

## Casos negativos obligatorios

`qa/iam-platform-real-v27.test.ts` reconstruye PostgreSQL y demuestra que un tenant admin con `system=true`:

- sigue teniendo `scope=tenant`;
- no satisface `hasPlatformAccess`;
- no puede recibir `platform.manage` por inserción DB;
- no puede iniciar sesión sin licencia sólo por ser `system=true`;
- recibe 403 frente a la consola comercial/plataforma;
- no salta una suscripción suspendida.

La prueba usa únicamente PostgreSQL efímero y datos QA desechables. No toca Supabase remoto.

## Gates

- `node scripts/iam-platform-isolation-audit.mjs`
- `node --test tests/issue_27_platform_iam_isolation.test.mjs`
- `npm --workspace backend run typecheck`
- `npx tsx qa/iam-platform-real-v27.test.ts`
- workflow `.github/workflows/iam-platform-isolation-v27.yml`

El auditor IAM también forma parte de `security-baseline`.

## Rollback

El rollback de código puede hacerse revirtiendo el PR. La normalización DB es deliberadamente reductora de privilegios: un binding global eliminado de un tenant cliente **no debe restaurarse automáticamente**. Si un operador legítimo pierde acceso, se debe volver a provisionar mediante el tenant interno y el flujo administrativo de plataforma, dejando evidencia de auditoría.

## Revisión AppSec/IAM

Antes de merge:

- confirmar que no existe ningún bypass sensible basado en `Role.system`;
- revisar que toda consulta global pasa por `platformAccess.ts` o por el trigger DB equivalente;
- revisar el resultado real del workflow PostgreSQL;
- no aceptar como PASS un job que no haya ejecutado pasos.
