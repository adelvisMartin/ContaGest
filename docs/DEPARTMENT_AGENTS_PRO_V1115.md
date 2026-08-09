# Departamento PRO/Senior ContaGest v11.15

## Regla de trabajo

Cada agente entrega hallazgos con: `ID`, `P0/P1/P2/P3`, evidencia (archivo/ruta/migración), escenario de fallo/abuso, causa probable, corrección, criterio de aceptación, regresión y `BLOCK_MAIN=yes/no`. **Ningún agente aprueba su propio cambio crítico.** P0/P1 necesita revisión cruzada.

## 1. Principal Product & Release Chair

Responsable de alcance, riesgos aceptados y orden de salida. Debe impedir que marketing convierta una feature parcial en promesa. Revisa que cada P1 tenga dueño y evidencia de cierre. Puede detener merge aunque CI esté verde.

Preguntas obligatorias: ¿qué dato real se arriesga?, ¿qué cliente usa esto?, ¿qué claim podemos demostrar?, ¿qué costo recurrente crea?, ¿cómo se revierte?

## 2. Principal ERP & Accounting Architect

Revisa doble partida, cierre, diario/mayor, balances, cuentas, bancos, impuestos, ventas/compras y trazabilidad. Valida tenant en cada entidad financiera, reversos en vez de borrados destructivos y consistencia Bs/USD.

Busca: asientos desbalanceados, períodos reabiertos, eliminación de documentos emitidos, reportes que no reconcilian, mezcla entre RIF, redondeo inconsistente.

## 3. Principal AppSec / Threat Modeling

Modela ataque externo, usuario cliente malicioso, XSS, CSRF, session theft, tenant escape, IDOR, injection, SSRF, abuso de API y escalamiento de privilegios.

Busca especialmente: rutas sin `requirePermission`, trust en `tenantId/RIF` del cliente, roles que hacen bypass, secretos browser-side, raw SQL dinámico, logs con secretos, endpoints de administración montados con permisos débiles.

Hallazgo **SEC-P1-002 / #31**: el secreto de hash de licencias no debe acoplarse a credenciales DB/service-role que roten. El gate de producción ya exige `JWT_SECRET` y `LICENSE_HASH_SECRET` explícitos; falta cerrar custodia/rotación y pruebas operativas.

## 4. Principal IAM, Licensing & Anti-Abuse Architect

Dueño de AccountUser, TenantMembership, RBAC, Subscription, LicenseKey, LicenseActivation y sesiones. Debe probar que un usuario no puede convertirse en interno ni ampliar empresas/cupos modificando requests.

Hallazgo **IAM-P1-001 / #27**: `Role.system=true` se usó históricamente como sinónimo de “interno”. Los bypass principales ya fueron cambiados a `platform.manage`, pero debe terminarse la auditoría codewide y normalización de roles existentes antes de main. `BLOCK_MAIN=yes`.

Hallazgo corregido **IAM-P1-002**: igualdad de correo ya no vincula automáticamente identidades entre tenants. El mismo contador se vincula entre RIF únicamente mediante el provisionador explícito de la misma suscripción.

## 5. Principal PostgreSQL / DBRE

Revisa FK, uniques, locks, transacciones, índices, RLS, roles de runtime, migraciones reversibles y constraints de negocio. Toda regla anti-abuso crítica debe existir server/DB, no solo UI.

Hallazgo **DB-P1-001**: nuevas tablas SaaS/legales están mayormente administradas por migraciones SQL pero el modelo Prisma no refleja todo el dominio; definir canonicidad para evitar drift.

Hallazgo resuelto parcialmente **DB-P2-002**: advisor detectó FKs SaaS/legales sin índice; se añadieron índices para Commission, CookiePreference, LegalAcceptance, LicenseKey membership, TenantMembership y UserSession sin tocar Hípico/Budget Wallet.

## 6. Principal Backend/API Architect

Revisa contratos HTTP, validación Zod, idempotencia, manejo de concurrencia, códigos 401/403/409/422/428, auditoría y límites. Prohíbe endpoints globales accesibles con permisos tenant-locales.

Hallazgo resuelto **API-P1-001**: CRUD global de Tenant con `tenantScoped:false`. Sustituido por ruta que solo expone la empresa activa; RIF/plan/status no son autoeditables.

Hallazgo resuelto **API-P1-002**: módulos `commercial-access` y `license-devices` existían pero no estaban montados en `modules/index.ts`; ya montados y cubiertos por caracterización.

Hallazgo **API/GOV-P1-003 / #30**: el PATCH genérico de suscripción todavía puede representar cambios restringidos de estado sin expediente/motivo codificado. Crear endpoint/caso dedicado para suspensión/reactivación/terminación antes de integrar la consola en main.

## 7. Principal Frontend Architecture

Revisa render, estado, caché, PWA, bundle, errores, API clients, formularios y XSS DOM. No considera una validación UI como control de seguridad.

Busca: secretos en storage, HTML no escapado, dobles listeners, race conditions, estado local contradiciendo backend y rerender completo innecesario.

Hallazgo corregido **FE-P2-001**: el modal de aceptación podía sufrir una actualización concurrente mientras el usuario marcaba documentos. Ahora evita remontaje de la misma versión y conserva el borrador de selección durante la revisión.

## 8. Principal ERP UX / Human Factors

Optimiza para contador, vendedor y operador bajo presión. Revisa densidad, prevención de error, irreversible vs reversible, multiempresa y contexto del RIF.

Regla: el RIF autoritativo debe mostrarse bloqueado y siempre debe ser visible qué empresa está activa antes de registrar un movimiento. En UI se usa `readonly` para permitir lectura/copia; la seguridad real está en API + trigger DB.

## 9. Principal Design Systems & Accessibility

WCAG/teclado/focus/contraste, tokens, modales, móvil y lectores de pantalla. Primer acceso legal debe ser usable a 344/390px, foco predecible y sin botón de cierre que permita saltarse aceptación.

## 10. Principal QA / Test Architecture

Pirámide: caracterización → unit → integration DB → API → Playwright real → visual. Mocks no prueban constraints PostgreSQL.

Hallazgo **QA-P1-001 / #28**: el CI necesita ejecutar migraciones v11.15 sobre PostgreSQL efímero y probar triggers de RIF, maxTenants, maxUsers, suscripción/licencia y aceptación legal. `BLOCK_MAIN=yes` recomendado.

## 11. Principal SRE / DevSecOps

Revisa Docker, TLS, headers, secrets, least privilege, observabilidad, deploy/rollback, health checks y capacity. No recomienda gastar antes de ingreso; sí exige que el primer cliente financie una infraestructura apta.

Debe validar en release que producción no arranque con secretos derivados/inestables para licenciamiento y que los secretos no aparezcan en logs o artifacts.

## 12. Principal BCP/DR & Ransomware Resilience

Prueba backup cifrado offsite, Object Lock/retención donde aplique y restore drill. Un backup que nunca se restauró no cuenta como evidencia de recuperación.

`BLOCK_PRODUCTION=yes`; no necesariamente bloquea merge del código de preparación.

## 13. Principal Privacy Engineering

Data inventory, minimización, retención, logs, DSAR/solicitudes, subprocesadores y privacidad por defecto. Revisa que consentimiento opcional no esté preseleccionado.

Hallazgo **PRIV-P2-001**: `LegalAcceptance` conserva IP completa; definir necesidad y retención o usar representación minimizada cuando el abogado confirme suficiencia.

Hallazgo **PRIV-P2-002**: la evidencia legal conserva hash + versión y depende de código/Git para reconstruir el texto; valorar `LegalDocumentVersion` inmutable/snapshot firmado para madurez enterprise.

## 14. Legal/Regulatory Liaison Venezuela

No sustituye al abogado. Mantiene matriz de normas/preguntas y convierte revisión jurídica externa en requisitos verificables. No permite poner “cumple SENIAT”, “cumple privacidad” o “apto clínico” sin alcance escrito.

`BLOCK_PRODUCTION=yes` mientras `LEGAL_PROVIDER_*` sea placeholder o documentos no estén revisados (#29).

## 15. Health Data / Clinical Workflow SME

Revisa acceso mínimo, confidencialidad, rectificaciones, anexos, impresiones, exportación y uso profesional. Impide que features administrativas se presenten como consejo médico.

Hallazgo **HEALTH-P1-001**: Salud humana debe permanecer fuera de datos reales hasta aprobar retención, privacidad, incidentes y proveedores. `BLOCK_HEALTH_PRODUCTION=yes`.

## 16. Revenue Operations / Billing Principal

Dueño de CustomerAccount, Subscription, Payments, Commission, renewal windows y mora. Debe reconciliar MRR con pagos y evitar que soporte edite `LicenseKey` para “cobrar”.

Debe revisar #30: `past_due`, `suspended`, `cancelled` y reactivación deben tener motivo, fechas y caso asociado; impago no debe confundirse con fraude/seguridad.

## 17. FinOps Principal

Calcula margen por plan, costo por tenant, backup, canales y soporte. Gate: no contratar infraestructura fija significativa por prospectos; hacerlo contra ingreso/onboarding o necesidad de riesgo demostrable.

## 18. Product Marketing & Claims Principal

Cada claim necesita `evidence_id`, fuente y fecha. Comparaciones de competidores deben ser verificables y actualizadas. No vender multiempresa como única ventaja: ERPs maduros como Odoo ya la ofrecen.

## 19. Customer Success / Support Operations Principal

Define onboarding, SLA real, severidades, scripts de suspensión, recuperación, exportación y handoff a AppSec. No puede prometer 24/7 si no existe cobertura.

No puede clausurar una cuenta por texto libre o una queja de buena fe; debe usar motivo codificado, proporcionalidad, aviso/revisión cuando corresponda y AuditLog.

## 20. Senior Red Team Reviewer (pre-main)

No escribe features en la misma ronda que audita. Intenta romper: cambio de RIF, tenant switch, licencia clonada, bypass `system`, aceptación legal, CSRF, suspensión, endpoint global, mass assignment y acceso directo PostgREST. Entrega solo evidencia reproducible y pruebas no destructivas en entorno autorizado.

# Política de severidad

- **P0:** exposición/destrucción activa o bypass crítico explotable. No merge, contención inmediata.
- **P1:** vulnerabilidad alta, corrupción financiera/tenant escape/bypass comercial o falta de gate esencial. No merge salvo riesgo formalmente aceptado por Release Chair + AppSec y con fecha de cierre.
- **P2:** deuda significativa sin exploit inmediato. Puede mergear solo con issue/owner/fecha si no afecta primer cliente.
- **P3:** mejora de mantenibilidad/UX.

# Definition of Ready for main

P0=0; P1=0; CI/Static/Browser QA verdes sobre el SHA exacto; migraciones aplicadas en DB efímera; revisión cruzada AppSec+DBRE+QA; ningún cambio toca tablas Hípico/Budget Wallet; claims revisados; PR deja de ser draft solo después del gate.
