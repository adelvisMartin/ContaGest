# ContaGest v11.15 — Auditoría senior integral del repositorio

Fecha de corte: 2026-08-09  
Rama: `feat/v11.15-brand-visual-security-commercial`  
Regla de release: no fusionar a `main` sin CI + Static QA + Browser QA verdes y smoke de seguridad.

## 1. Lectura del producto

ContaGest debe tratarse como un **ERP modular de control financiero y operativo**. La columna vertebral comercial es contabilidad + reportes + ventas/inventario/bancos. Salud, veterinaria, fitness y restaurante son verticales opcionales; IA, email, WhatsApp y SMS son add-ons opcionales y medibles.

El producto no debe dividirse en aplicaciones independientes por cada oficio. El mismo core de identidad, tenant, seguridad, suscripción, auditoría y reporting debe servir a contador, vendedor, PyME y profesional; cada plan habilita un conjunto de módulos.

## 2. Mapa del repositorio y propiedad

| Área | Rutas/carpetas principales | Dueño senior | Estado v11.15 |
|---|---|---|---|
| Frontend shell/PWA | `frontend/src/app.js`, `components`, `styles`, `public` | Frontend + UX/UI + Design System | Operativo; theme semántico v11.15 y QA visual |
| Autenticación | `backend/src/modules/auth`, `shared/auth`, `frontend/src/services/auth*` | AppSec + Backend | Migrado en rama a HttpOnly/CSRF/refresh rotatorio |
| Tenant/RBAC | `shared/middleware/context.ts`, `modules/rbac` | AppSec + Backend + DB | Tenant firmado, roles y permisos; identidad global añadida |
| Multiempresa | `shared/identity/accountMembership.ts`, `multiTenantEnhancer.js` | ERP Architect + Backend + UX | Selector central autorizado por servidor |
| Licencias técnicas | `modules/licenses`, `shared/licensing`, `license-devices` | AppSec + Backend | Hash unificado, dispositivo server-issued, administración individual |
| Suscripción comercial | `modules/commercial`, `commercial-access`, frontend `LicensesPage` | Revenue Ops + Backend + BI | Separada de LicenseKey; MRR/renovaciones/pagos/comisiones |
| Contabilidad | `accounting`, chart accounts, ledger, statements, close | ERP Domain + Backend + QA | Prioridad de producto; mantener regresión estricta |
| Ventas/Compras/Inventario | `sales`, `purchases`, `inventory`/products, clients/suppliers | ERP Domain + Backend + Frontend | Core para vendedor/PyME |
| Bancos/Fiscal | `banking`, `fiscal`, exports/regulatory | ERP Domain + Legal/Domain | Core control; claims fiscales requieren revisión de dominio |
| Reportes/Analytics | `reports`, `analytics` | BI + ERP UX | Diferenciador central; métricas deben reconciliar con fuente |
| Vertical Salud | `verticals`, HealthcarePage | Domain Specialist + Privacy + UX | Add-on; no asumir certificaciones regulatorias |
| Veterinaria | `verticals/veterinary`, Veterinary page | Domain Specialist + UX | Add-on |
| Fitness | Gym pages/modules | Domain Specialist + UX | Add-on |
| Restaurante | `food`, POS/tracking | Domain Specialist + UX | Add-on |
| IA | `ai`, AiAssistantPage | AI/Product + AppSec | Add-on supervisado; acciones con aprobación humana |
| Infra/Deploy | `vercel`, `ops/docker`, workflows | DevOps/SRE + FinOps | Vercel QA actual + ruta self-host preparada |
| Backups/DR | `ops/backup` | DBA + SRE | Scripts cifrados + restore drill preparados; activar en producción |
| QA | `tests`, `qa`, GitHub Actions | QA Lead | CI/static/browser automatizados |

## 3. Hallazgos por agente

### Principal Product / ERP Architect
**Fortaleza:** amplitud funcional ya suficiente para construir paquetes comerciales.  
**Riesgo:** vender “muchos módulos” en lugar de resultados.  
**Decisión:** cuatro ICP base: Contador Multiempresa, Vendedor/Comercio, PyME Integral y Profesional. Verticales como add-on.

### AppSec Lead
**Resuelto en rama:** JWT fuera de localStorage, access 15 min, refresh HttpOnly rotatorio, CSRF, sesión revocable por `sid`, hash de licencia único, dispositivo con credencial server-issued, SQL unsafe retirado en licencias.  
**Gate productivo:** pruebas E2E de cookies sobre HTTPS real, rotación/reutilización, suspensión comercial, revocación de dispositivo y sesión.

### Backend Principal
**Fortaleza:** API modular Express/Prisma, RBAC y tenancy ya integrados.  
**Mejora:** continuar extrayendo reglas duplicadas de permisos/planes hacia servicios compartidos. Mantener APIs `/auth`, `/licenses`, `/commercial` y `/commercial-access` como contratos separados.

### DBA/PostgreSQL
**Resuelto:** triggers de `maxTenants`, binding suscripción→tenant y `maxUsers` por identidad distinta; misma persona puede ocupar varios RIF sin consumir múltiples usuarios del contrato.  
**Mejora:** monitorear índices con tráfico real antes de eliminar índices marcados como “unused”; definir rol runtime mínimo en producción dedicada.

### Frontend Principal
**Fortaleza:** PWA y shell modular.  
**Deuda:** capas CSS históricas.  
**Política:** no añadir nuevos hardcodes cuando exista token semántico; refactor incremental por componente con screenshots de regresión, nunca rediseño masivo sin caracterización.

### ERP UX/UI
**Prioridad:** siempre mostrar empresa/RIF activo en contextos multiempresa, evitar que el usuario contabilice en la empresa equivocada.  
**Implementado:** selector de empresa solo con memberships devueltos por servidor.  
**Siguiente:** barra/context badge persistente en operaciones de alto impacto (cierre, asiento, pago, emisión fiscal).

### Diseño gráfico / Design System
**Implementado:** logo profesional, iconos PWA, theme semántico claro/oscuro y contrastes automatizados.  
**Siguiente:** retirar gradualmente estilos legacy que duplican tokens y documentar estados hover/focus/error/disabled de componentes críticos.

### QA Lead
**Gates:** Node tests, TypeScript/build, Static QA, Browser QA mobile/desktop, screenshots.  
**Siguiente:** E2E backend real en entorno efímero PostgreSQL para login-cookie, multiempresa y suscripción, además de restore drill automatizado periódico.

### DevOps/SRE
**Decisión económica:** no comprar infraestructura administrada antes de ingreso. Ruta self-host Docker/Caddy/Postgres preparada para activarse con pago/onboarding.  
**Gate:** producción real requiere backup offsite cifrado, restore probado, monitoreo y parcheo.

### FinOps
**Regla:** infraestructura sigue ingreso. Gate 0 = costo incremental mínimo para demos. Gate 1 = contrato cobrado financia dominio/VPS/backups.  
**Métrica:** margen bruto por cliente debe descontar infraestructura, APIs, soporte y comisión; no mirar solo MRR.

### Revenue Ops
**Implementado:** CustomerAccount, Subscription, SubscriptionTenant, ModuleEntitlement, Payment, SalesAgent, Commission.  
**Control anti-abuso:** empresas y usuarios limitados en DB, no en el frontend.

### Marketing
**Posicionamiento:** “control financiero y operativo modular” y no “otro ERP con 50 módulos”.  
**Claims:** usar `docs/MARKETING_CLAIMS_REGISTER.md`; prohibido prometer E2EE, 100% seguro, SENIAT universal, todos los bancos, backup horario o soporte 24/7 sin evidencia.

### Privacy/Legal
**Gate:** antes de usar datos reales de salud/finanzas de terceros, definir contrato, privacidad, retención, acceso, soporte y jurisdicción aplicable. La existencia de un módulo médico no equivale a certificación regulatoria.

### BI/Data
**Nuevas métricas:** MRR, clientes, trials, past due, renovaciones 7/15/30, empresas cubiertas, pagos y comisiones.  
**Siguiente:** cohortes, churn, ARPA, CAC y horas soporte/cliente cuando exista muestra real.

## 4. Plan Contador Multiempresa

Modelo:
- una persona = `AccountUser` global;
- cada negocio = `Tenant`/RIF;
- cada vínculo = `TenantMembership`;
- contrato = `Subscription`;
- empresas pagadas = `SubscriptionTenant`;
- módulos = `ModuleEntitlement`;
- acceso técnico por empresa = `LicenseKey`;
- equipo = `LicenseActivation` + credencial server-issued.

Reglas de DB:
- no exceder `maxTenants`;
- una LicenseKey con `subscriptionId` solo puede pertenecer a un tenant de esa suscripción;
- `maxUsers` cuenta correos distintos, no cantidad de empresas: el mismo contador en cinco RIF consume un usuario;
- un correo diferente adicional sí consume otro usuario.

Referencia de producto actual: plan contador incluye un número configurable de empresas; empresa adicional tiene referencia comercial de USD 12, almacenada como metadato/configuración de contrato, no hardcodeada como obligación fiscal.

## 5. Plan Vendedor/Comercio

Core recomendado: Dashboard, Ventas, Cotizaciones, Clientes, Inventario, Kardex, Reportes y Analytics. Compras/Bancos/Contabilidad se añaden si el negocio lo necesita. Soporte se gobierna por `Subscription.supportLevel`; no exige vertical médica/fitness.

## 6. Verticales y add-ons

- Salud: add-on para prácticas médicas y ramas relacionadas cuando exista cliente/alcance concreto.
- Veterinaria: add-on independiente.
- Fitness: add-on independiente.
- Restaurante: add-on independiente.
- IA/email/WhatsApp/SMS: opcionales; los canales con costo variable deben tener cuota/límite o recargo.

## 7. Cuándo mejorar cada capa

### Antes de merge v11.15
- mantener CI/Static/Browser verdes;
- validar cookies/CSRF/refresh/device con backend real;
- validar consola comercial y multiempresa;
- no tocar producción hasta release aprobado.

### Con 0 clientes pagos
- usar entorno gratuito para QA/demo con datos ficticios;
- no asumir SLA ni backup productivo;
- continuar marketing, demos, documentación y pruebas.

### Al cobrar primer cliente
- cobrar activación/onboarding o prepago suficiente;
- desplegar dominio + infraestructura dedicada/self-host;
- migrar únicamente ContaGest al entorno productivo dedicado;
- configurar backup offsite/restore/monitoreo;
- smoke y aceptación antes de cargar datos reales.

### Con varios clientes / MRR estable
- medir costo operativo real;
- evaluar managed DB/HA/PITR solo cuando reduzca riesgo/costo total;
- priorizar observabilidad, automatización de onboarding y soporte.

## 8. Criterio de “vendible”

ContaGest no se declara vendible por tener una landing o muchos módulos. El gate es:
1. seguridad de sesión/licencia validada E2E;
2. tenant/multiempresa probado sin fuga cruzada;
3. backup y restore probado en producción;
4. módulos contratados funcionales y con QA;
5. onboarding/documentación reproducibles;
6. pricing y soporte con margen positivo;
7. claims comerciales verificables.
