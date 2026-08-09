# ContaGest — FinOps y gates de crecimiento

## Principio
**La infraestructura sigue al ingreso, no al prospecto.** No se compra un plan mensual caro por tener una demo.

## Gate 0 — 0 clientes pagos
- Vercel/Supabase gratuitos actuales: QA, demos y desarrollo.
- No guardar datos médicos/financieros reales de terceros como entorno comercial.
- No separar todavía las tablas compartidas: Hípico y Budget Wallet permanecen intactos durante pruebas.
- Coste incremental objetivo cercano a 0.

## Gate 1 — primer contrato cobrado
Condición: depósito/onboarding o prepago trimestral/semestral/anual recibido.
Usar ese cobro para financiar dominio, VPS económico, backup externo cifrado y horas de instalación/migración. Modelo: `activación/onboarding + suscripción`; no financiar tú el primer año del cliente.

## Gate 2 — 2 a 10 clientes
Mantener un VPS mientras cumpla capacidad y SLO. Revisar CPU p95 <70%, RAM p95 <80%, disco <70%, backup diario, restore mensual, 5xx/latencia, MRR, ARPA, churn y horas soporte/cliente. Migrar a managed cuando riesgo/costo operativo supere el ahorro.

## Gate 3 — MRR estable o requisitos sensibles
Evaluar DB administrada, segundo nodo, observabilidad o HA cuando exista MRR suficiente, clientes sensibles exijan controles superiores, se supere el VPS o haga falta PITR/replicas/SLA real.

## Regla económica
`Margen bruto = MRR - infraestructura - APIs variables - comisiones - soporte directo - pasarelas`.
Alertas: infraestructura fija >20% MRR durante 3 meses; soporte directo >25% MRR; IA/WhatsApp/SMS deben tener límite o recargo si generan costo variable.

## Planes
- **Vendedor/Comercio:** ventas + clientes + inventario + facturación operativa + reportes.
- **Contador Multiempresa:** contabilidad/reportes con N empresas incluidas; referencia actual **USD 12 por empresa adicional**, configurable por contrato.
- **PyME Integral:** operación comercial + compras + bancos + contabilidad/reportes.
- **Profesional:** clientes/cotización/facturación/reportes.
- Salud, veterinaria, fitness, restaurante: verticales opcionales.
- Email/WhatsApp/SMS/IA: add-ons opcionales y medibles.

## Regla anti-abuso multiempresa
Una empresa adicional no se habilita cambiando el RIF en frontend. Deben coincidir AccountUser, TenantMembership, SubscriptionTenant cuando exista contrato, maxTenants, LicenseKey usuario/tenant y ModuleEntitlement. El límite de empresas se valida también en PostgreSQL.
