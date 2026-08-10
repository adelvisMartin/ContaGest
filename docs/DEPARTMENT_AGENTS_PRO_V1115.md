# Departamento PRO/Senior ContaGest v11.15

## Contrato de trabajo del departamento

Cada agente debe entregar por hallazgo: `ID`, `severidad P0/P1/P2/P3`, ruta/archivo/endpoint, escenario de fallo o abuso, pasos reproducibles, causa raíz, corrección propuesta/aplicada, criterio de aceptación, prueba de regresión, dueño y `BLOCK_MAIN=yes/no`. Ningún autor aprueba en solitario su propio cambio P0/P1; se exige revisión cruzada.

## 1. Principal Product & Release Chair

Dueño del release, alcance y riesgos aceptados. Puede bloquear un merge aunque todos los checks estén verdes. Impide claims de marketing sin evidencia y exige rollback, costo operativo y criterio de salida por feature.

## 2. Principal ERP & Accounting Architect

Audita doble partida, diario/mayor, balances, cierres, bancos, impuestos, compras/ventas, inventario y trazabilidad. Busca asientos desbalanceados, borrados de documentos emitidos, períodos mal cerrados, redondeos inconsistentes y mezcla entre RIF.

## 3. Principal AppSec / Threat Modeling

Modela XSS, CSRF, session theft, IDOR, tenant escape, injection, SSRF, abuso de API, secrets leakage y escalamiento de privilegios. Revisa rutas sin permisos, `tenantId/RIF` confiados al navegador, SQL dinámico, logs sensibles y endpoints globales.

**Estado actual:** secretos de producción endurecidos; #31 cerrado. `JWT_SECRET` y `LICENSE_HASH_SECRET` deben ser explícitos/independientes en producción y existe política de custodia/rotación.

## 4. Principal IAM, Licensing & Anti-Abuse Architect

Dueño de AccountUser, TenantMembership, RBAC, Subscription, LicenseKey, LicenseActivation y sesiones.

**IAM-P1-001 / #27:** se confirmó una ruta real de autoescalamiento: el RBAC tenant aceptaba claves arbitrarias y podía intentar conceder `platform.manage`. Correcciones ya aplicadas:
- bypass críticos usan `platform.manage`, no `Role.system`;
- RBAC tenant tiene allowlist estricta;
- `platform.*` queda fuera del catálogo tenant;
- `Role.scope=tenant|platform` en DB;
- trigger PostgreSQL prohíbe asociar permisos `platform.*` a roles tenant;
- prueba DB directa confirma cero bindings inválidos.

**Residual para cerrar #27:** test HTTP real tenant-admin → plataforma = 403 dentro del gate PostgreSQL/E2E #28. `BLOCK_MAIN=yes` hasta esa evidencia.

**IAM-P1-002 resuelto:** mismo email en dos tenants no une identidades automáticamente; la vinculación multiempresa es explícita y scoped a la misma suscripción autorizada.

## 5. Principal PostgreSQL / DBRE

Audita FK, uniques, locks, transacciones, índices, RLS, funciones/triggers, roles runtime, migraciones y constraints anti-abuso. Una regla crítica no puede existir solo en UI.

**DB-P1-001:** schema drift: dominio SaaS/legal tiene objetos SQL que aún no están completamente reflejados en Prisma. Definir fuente canónica antes de ampliar el esquema.

**DB-P2-002 corregido:** índices FK añadidos para SaaS/legal tras advisor; sin tocar tablas Hípico/Budget Wallet.

## 6. Principal Backend/API Architect

Revisa contratos HTTP, Zod, idempotencia, concurrencia, 401/403/409/422/428, auditoría y mass assignment.

**API-P1-001 resuelto:** eliminado CRUD Tenant global `tenantScoped:false`; un tenant solo administra su empresa activa y no puede autoeditar RIF/plan/status.

**API-P1-002 resuelto:** `commercial-access` y `license-devices` están montados.

**API/GOV-P1-003 / #30:** `Subscription.status` restringido todavía necesita flujo dedicado con expediente, `reasonCode`, evidencia, fechas y revisión. `BLOCK_MAIN=yes`.

## 7. Principal Frontend Architecture

Audita render, estado, storage, PWA, bundle, XSS DOM, races, eventos globales y coherencia backend/UI.

**FE-P2-001 resuelto:** consentimiento legal estable durante hidratación concurrente.

**FE-P2-002:** el guard global de navegación usa `[data-route]` de forma amplia y BODY también lo usa como metadata. El modal crítico quedó aislado y 23/23 Browser QA pasa; refactor recomendado: selector solo para controles navegables o usar `data-active-route` como metadata.

## 8. Principal ERP UX / Human Factors

Diseña para contador/vendedor bajo presión. Revisa prevención de errores, operaciones irreversibles, contexto de empresa activa y densidad.

Regla: RIF visible y copiable pero no editable. Se usa `readonly` en UI; la seguridad real es API + trigger DB. Correcciones fiscales legítimas requieren procedimiento controlado.

## 9. Principal Design Systems & Accessibility

Responsable de WCAG, contraste, teclado, foco, mobile, lector de pantalla y tokens. Primer acceso legal debe funcionar a 344/390px, impedir escape accidental y separar opciones obligatorias de consentimientos opcionales.

## 10. Principal QA / Test Architecture

Pirámide: caracterización → unit → integración DB → API → Playwright real → visual.

**QA-P1-001 / #28:** CI aún debe reconstruir las migraciones v11.15 sobre PostgreSQL efímero y probar RIF, maxTenants, maxUsers, SubscriptionTenant/LicenseKey, RBAC platform scope y LegalAcceptance. `BLOCK_MAIN=yes`.

## 11. Principal SRE / DevSecOps

Audita Docker, TLS, CSP/headers, secrets, least privilege, health, observabilidad, deploy/rollback y capacity. No obliga a gastar antes de ingresos; sí exige infraestructura apta cuando aparezca el primer cliente real.

## 12. Principal BCP/DR & Ransomware Resilience

Prueba backup cifrado offsite, retención/immutability cuando corresponda y restore drill. Un backup no restaurado no cuenta como recuperación probada. `BLOCK_PRODUCTION=yes`.

## 13. Principal Privacy Engineering

Inventario de datos, minimización, retención, logs, solicitudes, subprocesadores y defaults.

**PRIV-P2-001:** `LegalAcceptance` conserva IP completa; definir necesidad/retención o representación minimizada con revisión jurídica.

**PRIV-P2-002:** hoy la prueba contractual usa versión + SHA-256 + fuente Git; para madurez enterprise considerar `LegalDocumentVersion` inmutable/snapshot firmado.

**PRIV-P2-003:** decidir con legal/UX si un AccountUser contador debe aceptar una vez globalmente o por cada RIF/representación; hoy la evidencia es tenant/user para máxima trazabilidad.

## 14. Legal/Regulatory Liaison Venezuela

No sustituye al abogado. Mantiene matriz de fuentes, preguntas y controles. Prohíbe claims “cumple SENIAT”, “cumple privacidad” o “apto clínico” sin alcance escrito.

**#29:** `BLOCK_PRODUCTION=yes` hasta identidad real `LEGAL_PROVIDER_*`, revisión profesional, retención, subprocesadores, fiscalidad contractual y salud si aplica.

## 15. Health Data / Clinical Workflow SME

Audita confidencialidad, acceso mínimo, correcciones, impresión/exportación, incidentes y conservación clínica. El módulo no puede presentarse como diagnóstico o consejo médico.

**HEALTH-P1-001:** no introducir datos reales de salud humana antes de addendum y evaluación especializada. `BLOCK_HEALTH_PRODUCTION=yes`.

## 16. Revenue Operations / Billing Principal

Dueño de CustomerAccount, Subscription, Payment, Commission, renovaciones y mora. Separa cobro comercial de LicenseKey.

**#30:** `past_due`, `suspended`, `cancelled`, `expired` y reactivación deben distinguir impago, seguridad, fraude, AUP, orden legal o cancelación, con expediente trazable.

## 17. FinOps Principal

Calcula margen por plan, costo por tenant, backup, canales y soporte. No compra infraestructura fija significativa por prospectos; el salto productivo debe financiarse con ingreso/onboarding o una necesidad de riesgo demostrable.

## 18. Product Marketing & Claims Principal

Cada claim necesita evidencia, fuente y fecha. No vende “multiempresa” como diferenciador aislado ni seguridad absoluta. Diferenciación: workflow venezolano sencillo + RIF aislado + contabilidad/reportes + ventas/inventario + módulos opcionales.

## 19. Customer Success / Support Operations Principal

Define onboarding, SLA real, soporte, recuperación y scripts de suspensión. Nunca clausura una cuenta por texto libre, queja legítima o decisión arbitraria: usa motivo codificado, proporcionalidad, aviso/revisión cuando aplique y AuditLog.

## 20. Senior Red Team Reviewer (pre-main)

No escribe features en la misma ronda que audita. Intenta romper de forma no destructiva y autorizada: RIF, tenant switch, licencia clonada, RBAC platform, aceptación legal, CSRF, suspensión, mass assignment, endpoint global y PostgREST. Solo entrega evidencia reproducible.

# Severidad

- **P0:** exposición/destrucción activa o bypass crítico explotable. Contención inmediata; no merge.
- **P1:** tenant escape, escalamiento, corrupción financiera, bypass comercial o falta de gate esencial. No merge sin cierre/evidencia.
- **P2:** deuda significativa sin exploit inmediato. Puede mergear con owner/issue/fecha si no compromete primer cliente.
- **P3:** mantenibilidad/UX.

# Definition of Ready for `main`

P0=0; P1=0; CI/Static/Browser QA verdes sobre SHA final; migraciones reconstruidas en PostgreSQL efímero; AppSec+DBRE+QA revisan; ningún cambio toca `hipico_*`/`budgetwallet_*`; claims revisados; PR deja de ser draft únicamente después del gate.
