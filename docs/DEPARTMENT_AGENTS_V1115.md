# ContaGest v11.15 — Departamento senior / agentes de trabajo

Este documento define los workstreams que deben revisar y evolucionar ContaGest como producto ERP/SaaS. Los agentes son roles de responsabilidad: cada cambio debe tener dueño, criterio de salida, pruebas y evidencia.

## 1. Principal Product / Program Director
**Misión:** ordenar prioridades P0/P1/P2, evitar cambios que rompan contratos, controlar alcance y coordinar releases.

**Responsabilidades**
- Mantener mapa de producto, dependencias y riesgos.
- Decidir qué entra a cada release y qué queda detrás de feature flags.
- Exigir caracterización antes de refactor y regresión después.
- Mantener matriz de deuda técnica, FODA y roadmap comercial.

**Salida mínima:** release checklist, riesgos aceptados, dependencias, QA verde y plan de rollback.

## 2. ERP Domain Architect / Contabilidad Senior
**Misión:** asegurar que ContaGest resuelva control empresarial real y no sea una colección de pantallas.

**Responsabilidades**
- Libro diario, mayor, balance de comprobación, hoja de trabajo, estados financieros, cierres y trazabilidad.
- Relación ventas/compras/inventario/bancos con contabilidad.
- Flujos para contador multiempresa, vendedor, comercio, servicios y profesionales.
- Separar núcleo ERP de verticales opcionales (salud, veterinaria, fitness, restaurante).

**Salida mínima:** matriz módulo→proceso→asiento/reporte→permiso→entitlement.

## 3. Application Security / AppSec Lead
**Misión:** reducir superficie de ataque antes de clientes reales.

**Responsabilidades**
- Sesiones HttpOnly/Secure/SameSite, refresh rotatorio y CSRF.
- MFA, rate limiting, anti-replay, revocación y auditoría.
- Licencias y credenciales de dispositivo emitidas por servidor.
- Threat model OWASP ASVS/API, revisión de dependencias y secretos.
- Verificación de aislamiento tenant y abuso de multiempresa/licencias.

**Salida mínima:** cero P0/P1 conocidos sin mitigación antes de producción comercial.

## 4. Backend Principal Engineer
**Misión:** APIs coherentes, testeables, con contratos estables y lógica de negocio centralizada.

**Responsabilidades**
- Express/TypeScript, servicios, validación Zod y errores.
- Auth, comercial, licencias, multiempresa y auditoría.
- Eliminar SQL unsafe y duplicación de reglas.
- Idempotencia, transacciones y compatibilidad de API.

**Salida mínima:** typecheck verde, pruebas de caracterización/regresión y contratos documentados.

## 5. Database / PostgreSQL / Supabase Lead
**Misión:** integridad, aislamiento, rendimiento y recuperación.

**Responsabilidades**
- Migraciones idempotentes y reversibles.
- Constraints, índices, RLS y privilegio mínimo.
- Separación lógica estricta por tenant.
- Plan de backup/restore y pruebas de restauración.
- No tocar tablas de otros productos sin una tarea explícita.

**Restricción actual:** Budget Wallet e Hípico comparten proyecto Supabase y NO deben modificarse durante este programa.

## 6. Frontend Principal Engineer
**Misión:** aplicación rápida, consistente y mantenible sin alterar comportamiento de negocio.

**Responsabilidades**
- Estado de sesión sin secretos persistentes en JS.
- Componentes reutilizables, accesibilidad y responsive.
- Reducir CSS legacy/duplicación y carga innecesaria.
- Integrar selector multiempresa, consola comercial y permisos.

**Salida mínima:** Browser QA desktop/mobile, sin overflow ni regresiones de rutas/textos críticos.

## 7. ERP UX/UI Lead
**Misión:** convertir procesos complejos en flujos claros para personas no técnicas.

**Responsabilidades**
- Arquitectura de información por perfil: contador, vendedor, administrador, profesional.
- Dashboards accionables, densidad adecuada, tablas y formularios.
- Multiempresa sin confusión de contexto: RIF/empresa siempre visible.
- Estados vacíos, loading, errores y confirmaciones destructivas.

**Salida mínima:** heurística Nielsen + WCAG AA + pruebas por tareas reales.

## 8. Design Systems / Graphic Design Lead
**Misión:** identidad profesional consistente.

**Responsabilidades**
- Logo, iconografía, assets, tokens y theming.
- Contraste claro/oscuro y escalas tipográficas.
- Manual de marca y uso correcto de activos.
- Evitar apariencia genérica de plantilla/IA.

**Salida mínima:** design tokens semánticos, guía de marca y capturas reales aprobadas.

## 9. QA / Test Automation Lead
**Misión:** impedir que una mejora rompa otra parte del ERP.

**Responsabilidades**
- Caracterización antes de cambios.
- Unit/integration/API/Playwright, responsive, accesibilidad y regresión visual.
- Casos multi-tenant y de abuso de licencia.
- Evidencia reproducible en GitHub Actions.

**Salida mínima:** matriz ID/severidad/ruta/dispositivo/pasos/actual/esperado/evidencia/causa/solución/regresión.

## 10. Infrastructure / DevOps / SRE Lead
**Misión:** despliegues baratos, reproducibles y recuperables.

**Responsabilidades**
- Vercel/Supabase durante desarrollo, sin forzar gasto prematuro.
- Docker/VPS como ruta de bajo costo para primeras ventas.
- Caddy/Nginx, TLS, health checks, logs, monitorización y rollback.
- Backups externos cifrados y restauración ensayada.

**Salida mínima:** deployment runbook y costo mensual/anual por etapa.

## 11. FinOps / Unit Economics Lead
**Misión:** que el producto gane dinero antes de escalar infraestructura.

**Responsabilidades**
- CAC, MRR, ARPA, margen, churn, comisión, soporte e infraestructura.
- Definir gates de gasto: no subir plan solo por tener un prospecto.
- Comparar VPS anual, servicios administrados y costo de soporte operativo.

**Salida mínima:** matriz de break-even y reglas de upgrade por uso/ingreso.

## 12. Commercial Operations / Revenue Lead
**Misión:** separar licencia técnica de la relación comercial.

**Responsabilidades**
- CustomerAccount, Subscription, pagos, renovaciones, módulos, vendedores y comisiones.
- Alertas 30/15/7 días, morosidad, trial→paid y suspensión/reactivación.
- Plan Contador multiempresa y plan Vendedor/Comercio.

**Salida mínima:** consola administrativa con MRR, clientes, renovaciones, planes, tenants, módulos y dispositivos.

## 13. Growth Marketing / Positioning Lead
**Misión:** vender valor, no “cantidad de módulos”.

**Responsabilidades**
- ICP: contador, comercio/vendedor, servicios/profesionales y verticales opcionales.
- Mensaje competitivo vs ERP genérico y sistemas locales.
- Pricing tests, onboarding, demo y funnel comercial.
- Claims verificables; prohibido publicar seguridad/cumplimiento no demostrado.

**Salida mínima:** propuesta de valor por perfil + páginas/guiones con claims auditables.

## 14. Privacy / Legal / Compliance Reviewer
**Misión:** reducir riesgo contractual y de datos, especialmente en salud/finanzas.

**Responsabilidades**
- Política de privacidad, tratamiento y retención.
- Términos de servicio/licencia, backups y responsabilidad.
- Revisar claims fiscales, médicos, seguridad y disponibilidad.

**Salida mínima:** lista de claims permitidos/prohibidos y requisitos previos a datos reales.

## 15. Data / BI Product Analyst
**Misión:** convertir datos del ERP y del SaaS en decisiones.

**Responsabilidades**
- Reportes contables/operativos y calidad del dato.
- MRR, churn, cohortes, uso de módulos, renovaciones y adopción.
- Telemetría con minimización de datos.

**Salida mínima:** catálogo KPI con fórmula, fuente y periodicidad.

---

# Orden de ejecución v11.15

1. **P0/P1 seguridad:** cookies HttpOnly + refresh rotatorio + CSRF; unificar hash; credencial de dispositivo; SQL seguro.
2. **Modelo SaaS:** AccountUser/TenantMembership + CustomerAccount/Subscription/SubscriptionTenant/ModuleEntitlement/Payment/SalesAgent/Commission.
3. **Abuso multiempresa:** ningún cambio de RIF por UI puede conceder acceso; el servidor solo permite tenants con membership y entitlement.
4. **Consola comercial:** MRR, trials, activos, vencidos/morosos, renovaciones, vendedores, comisiones, tenants, módulos, dispositivos.
5. **Plan Contador:** N empresas incluidas + precio por empresa adicional, manteniendo bases/tenant aislados.
6. **Plan Vendedor/Comercio:** ventas + inventario + facturación + clientes + reportes; soporte incluido según plan.
7. **Verticales opcionales:** salud/veterinaria/fitness no definen el producto base; son paquetes activables si aparece el cliente adecuado.
8. **Canales opcionales:** WhatsApp/SMS/email como add-ons/entitlements; no dependencia del core.
9. **Infraestructura por etapas:** demo gratis → primeras ventas en infraestructura de bajo costo → administrado cuando MRR lo justifique.
10. **QA y release:** no fusionar PR hasta que CI, Static QA, Browser QA y casos de seguridad/multiempresa estén verdes.
