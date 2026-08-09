# PR #20 — Gate previo a integración en `main`

## Blockers P1

- [ ] **IAM-P1-001:** separar `tenant admin` de `platform/internal`; eliminar bypass basado únicamente en `Role.system=true` donde pueda alcanzar usuarios cliente.
- [ ] **QA-P1-001:** CI con PostgreSQL real: crear DB, ejecutar migraciones, probar triggers y rutas críticas.
- [ ] Revisar el resultado de AppSec/DBRE/QA sobre el SHA final.

## Seguridad y tenant

- [x] JWT fuera de localStorage.
- [x] Cookies HttpOnly/refresh/CSRF.
- [x] sesión server-side revocable.
- [x] hash de licencia canónico.
- [x] credencial server-issued de dispositivo.
- [x] maxTenants/maxUsers en DB.
- [x] RIF inmutable en DB y API normal.
- [x] CRUD Tenant global eliminado del plano tenant-local.
- [ ] test de tenant escape con backend+DB real.
- [ ] test de rol tenant admin intentando `platform.manage`.

## Legal/primer acceso

- [x] catálogo legal versionado.
- [x] SHA-256 por contenido.
- [x] `LegalAcceptance` + `CookiePreference`.
- [x] 428 hasta aceptación actual.
- [x] cookies necesarias obligatorias; analítica opcional OFF; marketing OFF.
- [x] rechazo implica salida.
- [ ] definir `LEGAL_PROVIDER_*` antes de cliente real.
- [ ] revisión de abogado antes de cliente real.
- [ ] decidir retención de IP en evidencia legal.
- [ ] addendum Salud antes de datos clínicos reales.

## Comercial

- [x] Subscription separada de LicenseKey.
- [x] suscripción/empresa/módulos/usuario/dispositivo.
- [x] endpoints `commercial-access` y `license-devices` montados.
- [ ] E2E real suspender → bloquea → pagar/reactivar → recupera.
- [ ] E2E contador con dos RIF sin mezcla de datos.

## Calidad

- [ ] TypeScript verde.
- [ ] tests Node verdes.
- [ ] build frontend/backend verde.
- [ ] Playwright verde incluyendo `legal-first-access.spec.mjs`.
- [ ] npm audit sin vulnerabilidades high/critical no aceptadas.
- [ ] bundle budget verde.
- [ ] SHA final anotado aquí al aprobar.

## Producción (puede ser posterior al merge, pero anterior a clientes reales)

- [ ] dominio/TLS final.
- [ ] runtime DB least privilege.
- [ ] backup offsite cifrado.
- [ ] restore drill documentado.
- [ ] monitoreo/alertas.
- [ ] contrato comercial y privacidad revisados.
- [ ] entorno de datos reales separado cuando el negocio pueda financiarlo según gate FinOps.
