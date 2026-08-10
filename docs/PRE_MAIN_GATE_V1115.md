# PR #20 — Gate previo a integración en `main`

## Blockers P1

- [ ] **IAM-P1-001 / #27:** terminar auditoría `tenant admin` vs `platform/internal`; los bypass principales ya exigen `platform.manage`, pero falta revisión codewide/migración de roles existentes.
- [ ] **QA-P1-001 / #28:** CI con PostgreSQL real: crear DB, ejecutar migraciones, probar triggers y rutas críticas.
- [ ] **GOV-P1-001 / #30:** suspender/terminar exige expediente + `reasonCode`; retirar transición restringida por PATCH genérico antes de integrar la consola comercial en main.
- [x] **SEC-P1-002 / #31:** producción exige secreto estable de licencias; gate explícito, prueba de caracterización y política de custodia/rotación implementados. La configuración del valor real sigue siendo gate de despliegue, no deuda de código.
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
- [x] igualdad de email ya no vincula identidades entre tenants por sí sola.
- [x] bypass comerciales principales ya no confían únicamente en `Role.system`.
- [ ] test de tenant escape con backend+DB real.
- [ ] test API de rol tenant admin intentando `platform.manage`.

## Legal/primer acceso

- [x] catálogo legal versionado.
- [x] SHA-256 por contenido.
- [x] `LegalAcceptance` + `CookiePreference`.
- [x] 428 para clientes licenciados hasta aceptación actual.
- [x] cookies necesarias informadas/aceptadas para usar la sesión segura; analítica opcional OFF; marketing OFF.
- [x] rechazo implica salida.
- [ ] definir `LEGAL_PROVIDER_*` antes de cliente real.
- [ ] revisión de abogado antes de cliente real (#29).
- [ ] decidir retención/minimización de IP en evidencia legal.
- [ ] addendum Salud antes de datos clínicos reales.

## Comercial

- [x] Subscription separada de LicenseKey.
- [x] suscripción/empresa/módulos/usuario/dispositivo.
- [x] endpoints `commercial-access` y `license-devices` montados.
- [ ] endpoint/caso estructurado para suspensión/terminación (#30).
- [ ] E2E real suspender → bloquea → pagar/reactivar → recupera.
- [ ] E2E contador con dos RIF sin mezcla de datos.

## Calidad

- [ ] TypeScript verde sobre SHA final.
- [ ] tests Node verdes sobre SHA final.
- [ ] build frontend/backend verde sobre SHA final.
- [ ] Playwright verde incluyendo `legal-first-access.spec.mjs`.
- [ ] npm audit sin vulnerabilidades high/critical no aceptadas.
- [ ] bundle budget verde.
- [ ] SHA final anotado aquí al aprobar.

## Producción (puede ser posterior al merge, pero anterior a clientes reales)

- [ ] dominio/TLS final.
- [ ] `JWT_SECRET` y `LICENSE_HASH_SECRET` explícitos/estables cargados en el proveedor de producción.
- [ ] runtime DB least privilege.
- [ ] backup offsite cifrado.
- [ ] restore drill documentado.
- [ ] monitoreo/alertas.
- [ ] contrato comercial y privacidad revisados.
- [ ] entorno de datos reales separado cuando el negocio pueda financiarlo según gate FinOps.
