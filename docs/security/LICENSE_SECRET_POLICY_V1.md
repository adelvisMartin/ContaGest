# Política de custodia de `LICENSE_HASH_SECRET` v1

`LICENSE_HASH_SECRET` es un secreto estable del backend y es independiente de `JWT_SECRET`, credenciales PostgreSQL, Supabase service-role, dominio y proveedores de hosting.

## Reglas

- Debe configurarse explícitamente en producción y tener suficiente entropía (mínimo técnico del gate: 32 caracteres; operativamente usar material aleatorio de mayor entropía).
- Nunca se expone como `VITE_*`, no se envía al navegador, no se registra en logs, tickets, capturas ni documentación pública.
- Debe existir una copia de recuperación cifrada, controlada por el responsable de release/infraestructura y separada del servidor principal.
- Rotar la contraseña de DB, service-role o una API externa **no puede cambiar** este secreto.
- Mientras `LicenseKey` no tenga `hashVersion/keyId` y dual-key, este secreto no se rota rutinariamente: una rotación no coordinada impediría validar claves emitidas cuyo plaintext no se conserva.

## Si existe sospecha de compromiso

1. Contener acceso al almacén de secretos y preservar evidencia.
2. Determinar si el secreto fue realmente expuesto; no rotar a ciegas si ello destruye la capacidad de validar licencias.
3. Implementar antes de la rotación un esquema versionado (`hashVersion`/`keyId`) capaz de validar temporalmente secreto anterior y nuevo, o preparar una reemisión controlada de licencias.
4. Migrar/reemitir las licencias afectadas.
5. Retirar el secreto anterior cuando ya no existan licencias activas que dependan de él.
6. Registrar el incidente y la rotación sin guardar el valor del secreto en `AuditLog`.

## `JWT_SECRET`

También debe ser explícito e independiente. Su rotación puede invalidar sesiones de forma controlada, pero jamás debe modificar el hash de las licencias. Una evolución futura puede usar `kid` para rotación de claves de firma sin cierre masivo de sesiones.

## Gate de producción

Antes del primer cliente real se verifica que:

- `JWT_SECRET` existe explícitamente;
- `LICENSE_HASH_SECRET` existe explícitamente y es distinto;
- ambos solo están disponibles en backend;
- el release falla de forma segura si faltan;
- existe custodia cifrada y responsable designado para `LICENSE_HASH_SECRET`;
- los logs/artefactos de CI no contienen los valores.
