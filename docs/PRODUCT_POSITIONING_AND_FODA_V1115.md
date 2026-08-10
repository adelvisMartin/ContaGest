# ContaGest v11.15 — Posicionamiento, FODA y mitigaciones

## Producto base
ContaGest no se define por una vertical. El núcleo es **control financiero y operativo modular para negocios y profesionales**, con contabilidad/reportes como columna vertebral.

## ICP prioritarios
1. **Contador/firma:** varias empresas/RIF, mismo usuario, contexto visible y datos aislados; diario, mayor, balance, hoja de trabajo, estados, cierres, bancos, tributos y reportes.
2. **Vendedor/comercio:** clientes, ventas, inventario, facturación operativa, historial y reportes.
3. **PyME integral:** ventas + compras + inventario + bancos + contabilidad/reportes.
4. **Servicios/profesionales:** clientes, cotizaciones, ventas y reportes.

## Paquetes opcionales
Salud/veterinaria, fitness y restaurante son verticales activables. IA, email, WhatsApp y SMS son add-ons; ninguno condiciona el core.

## Diferenciador multiempresa
No es un selector cosmético de RIF. Una persona tiene AccountUser, cada negocio Tenant y el acceso necesita TenantMembership. Para clientes pagos se suma SubscriptionTenant, LicenseKey y entitlements. Así el plan contador permite varias empresas sin reutilizar una licencia en RIF no contratados.

## Debilidades -> acción
- CSS legacy -> no crear nuevas excepciones; migración por tokens/componentes con regresión visual.
- Multiempresa no central -> AccountUser/TenantMembership + selector server-authorized v11.15.
- Suscripción mezclada con licencia -> capa comercial separada.
- JWT localStorage -> cookies HttpOnly + CSRF v11.15.
- Producto joven -> release checklist, casos reales y onboarding reproducible antes de SLA.
- Soporte concentrado -> KB, diagnóstico, telemetría mínima y niveles de soporte.
- Sin churn/CAC -> CustomerAccount/Subscription/Payments/Commissions desde primeras ventas.

## Oportunidades -> captura
- Excel -> importación guiada + validación previa.
- Contadores -> plan multiempresa + empresa adicional facturable.
- Vendedores -> ventas/inventario/facturación/reportes sin obligar contabilidad avanzada.
- Verticales -> add-on si aparece el cliente correcto.
- Partners -> SalesAgent + Commission.
- IA -> add-on supervisado con límites de costo.

## Amenazas -> mitigación
- Competidores locales -> flexibilidad, contabilidad/reportes y multiempresa controlado; no solo precio.
- ERP grandes -> onboarding sencillo y paquetes claros; no replicar todo.
- Cambios fiscales -> parámetros/versionado/feed + claims prudentes.
- Ataques -> AppSec gate, sesiones revocables, dispositivo server-issued, tenant/RLS y restore probado.
- Costos soporte -> onboarding pagado, límites y documentación.
- Precio cloud -> Docker portable + FinOps gates.
- Conectividad -> PWA/UX tolerante a latencia; no prometer offline transaccional si no está implementado.

## Mensajes
- Contador: "Varias empresas, un acceso, cada RIF aislado y controlado por tu plan."
- Comercio/vendedor: "Ventas, inventario, clientes y reportes en un solo flujo."
- PyME: "Control operativo y contable ampliable por módulos, sin empezar con un ERP sobredimensionado."
