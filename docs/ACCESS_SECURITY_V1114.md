# ContaGest-VE v11.14 · Accesos y seguridad

## Portales

- Acceso interno + cliente: `https://conta-gest-frontend.vercel.app/`
- Portal exclusivo Cliente con licencia: `https://conta-gest-frontend.vercel.app/cliente`

El segundo enlace fuerza la interfaz de cliente. El backend no concede permisos por URL: los privilegios se derivan de roles/permisos del usuario y las rutas administrativas exigen `admin.manage`.

## Dónde están los usuarios en Supabase

ContaGest usa autenticación propia sobre PostgreSQL/Prisma. No existe una columna con contraseña en texto plano.

- `public."UserProfile"`: correo, nombre, estado y `passwordHash` bcrypt.
- `public."Role"`: definición de roles por empresa.
- `public."UserRole"`: relación usuario ↔ rol.
- `public."Permission"` y `public."RolePermission"`: permisos efectivos.
- `public."AuthLoginAttempt"`: intentos de acceso usados para bloqueo/desbloqueo.
- `public."LicenseKey"` y `public."LicenseActivation"`: licencia y dispositivos autorizados para clientes.

Administrador principal del tenant demo/operativo actual:

- RIF/tenant: `00000000`
- correo: `admin@erp.local`
- rol esperado: `Administrador Global`

## Restablecimiento administrativo de contraseña

La contraseña existente no puede recuperarse porque se guarda como hash bcrypt. Si se pierde, se reemplaza por una nueva. Desde v11.14, un administrador autenticado puede hacerlo desde **Panel admin → Usuarios reales · acceso y desbloqueo**.

Si no existe ninguna sesión administrativa recuperable, el propietario de la base puede ejecutar en Supabase SQL Editor, sustituyendo el marcador por una contraseña fuerte nueva:

```sql
update public."UserProfile" u
set "passwordHash" = crypt('<NUEVA_PASSWORD_FUERTE>', gen_salt('bf', 12)),
    status = 'active',
    "updatedAt" = now()
from public."Tenant" t
where u."tenantId" = t.id
  and t.rif = '00000000'
  and lower(u.email) = 'admin@erp.local';

delete from public."AuthLoginAttempt"
where "tenantRif" = '00000000'
  and lower(email) = 'admin@erp.local';
```

La extensión `pgcrypto` debe estar disponible para `crypt`/`gen_salt`. Nunca guardar la contraseña nueva directamente en `passwordHash` sin hashing.

## Bloqueo de cuentas

Cinco contraseñas incorrectas deshabilitan la cuenta. El CAPTCHA puede renovarse sin consumir ese contador. Para reactivar una cuenta, el administrador usa la consola de usuarios o cambia `status` a `active` y elimina los intentos fallidos correspondientes. El propio administrador no puede bloquearse ni quitarse su permiso administrativo desde la consola web.
