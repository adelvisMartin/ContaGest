# Guía de benchmark competitivo por sector — ContaGest y Control Hípico

**Revisión de referencias:** 2026-11-19. **Autoridad:** `AGENTS.md` y [protocolo de tickets](TICKET_ENGINEERING_PROTOCOL.md). Esta matriz representa comportamientos documentados públicamente, **no** funcionalidades verificadas en ContaGest ni permiso para copiar o automatizar su extracción. Antes de implementar, comparar contra el HEAD real y sus pruebas.

## Investigación por dominio: pregunta, fuente y QA

| Área / dueño | Referencia primaria pública | Qué investigar y adaptar, sólo si existe un gap | Negativos y evidencia de QA |
| --- | --- | --- | --- |
| ERP / contabilidad #708 | [ERPNext Accounting Entries](https://docs.frappe.io/erpnext/accounting-entries) | Efecto de cada documento en libro mayor, saldos, períodos y reportes | Decimal, balance de asientos, posted append-only, reversos, tenants A/B |
| Administración / CRM #708 | [ERPNext CRM](https://docs.frappe.io/erpnext/crm) | Lead→opportunity→quotation→customer, seguimiento sin doble captación | Conversiones simultáneas, permisos vendedor, trazabilidad y duplicados |
| Ventas #708 | [ERPNext Selling](https://docs.frappe.io/erpnext/selling) | Cotización→orden→entrega parcial→factura→pago | Stock, impuestos, devolución, retry sin doble factura ni saldo |
| Compras / cuentas por pagar #757 | [ERPNext Accounting Entries](https://docs.frappe.io/erpnext/accounting-entries) | Pedido→recepción→factura de proveedor→pago y costo | Cross-tenant proveedor/producto, parciales, idempotencia y transacción |
| Inventario #708 | [ERPNext Item](https://docs.frappe.io/erpnext/item), [Batch](https://docs.frappe.io/erpnext/batch) | Lotes, expiry, múltiples almacenes y nivel de reposición | FEFO, stocks simultáneos, cantidad disponible, lotes vencidos |
| KPI / tableros #770/#1293 | [ERPNext Cost Center](https://docs.frappe.io/erpnext/cost-center) | KPI explicado por transacción y dimensión de actividad, sin tarjeta decorativa | Drill-down cuadra con ledger; roles y paginación; API p95 |
| Costos / presupuestos #708/#770 | [ERPNext Cost Center & Budgeting](https://docs.frappe.io/erpnext/cost-center-and-budgeting) | Separar fijos/variables, costos unitarios, actividad, moneda y versiones | Total=desglose, tasa/documento, Decimal, período y snapshot |
| Punto de equilibrio #708/#770 | Cost centers/budgeting solo como analogía, no fórmula oficial del punto de equilibrio | Proyección por **cada mes y año**, ingresos/variables USD, margen de contribución y costo fijo | Suma de 12 meses vs anual, cero margen, previsiones 2027–2032 si las pide el ticket |
| Conciliación bancaria #743 | [ERPNext Bank Reconciliation](https://docs.frappe.io/erpnext/bank-reconciliation) | Separar fecha de compensación y fecha de asiento, match confirmado | 1:N / N:1, duplicados, reversos, cuentas/monedas y permisos |
| Hoja de trabajo contable #708/#743 | [ERPNext Accounting Entries](https://docs.frappe.io/erpnext/accounting-entries) | Balance de comprobación→ajustes→balance ajustado→resultados→balance | Fórmulas, conciliación entre columnas, asiento origen, cierre y export |
| Gym #709 | [wger Documentation](https://wger.readthedocs.io/en/2.0/index.html), [GitHub](https://github.com/wger-project/wger) | Rutinas versionadas, sesiones/sets, progreso, nutrición y PWA | Socio A/B, offline retry, duplicados, estimaciones declaradas; revisar licencia de datos y software separadamente |
| Veterinaria #711 | [OpenVPMS Features](https://www.openvpms.com/features) | Tutor/animal→visita→vacunas→tratamiento→cobro, historia y addenda | Tutor A no consulta mascota B, lote vencido, nota firmada y consentimiento |
| Odontología #710 | [Open Dental Modules](https://www.opendental.com/site/0_modules.html) | Agenda multi-sillón, odontograma histórico, plan de tratamiento y cobro | Colisión profesional/sillón, superficies, firma y reversos |
| Medicina #712 | [OpenMRS REST](https://rest.openmrs.org/) y [FHIR](https://openmrs.atlassian.net/wiki/spaces/docs/pages/26935684) | Encounter→observación→orden→resultado→corrección, interoperabilidad opcional | PHI, propiedad del paciente, revisión/firma, aislamiento y auditoría; no imponer FHIR sin contrato |
| Control Hípico #837/#839 | El **dominio canónico del propio repositorio** y comparables públicos autorizados | Jornada→carreras→resultados→cierre→reporte revisado reproducible | Sin cifras inventadas, dedup/replay, offline, soak/restore y QA física; SOURCE Messenger sin autolectura ni autoenvío |
| Infraestructura / telecom / performance #720/#840/#1293 | [PostgreSQL EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html), [Core Web Vitals](https://web.dev/articles/vitals) y [Playwright](https://playwright.dev/docs/best-practices) | Optimizar N+1, índices, JS por ruta, red, disponibilidad y recuperación | p50/p95, budgets p75, memoria, CSP/CORS/TLS, no caché cross-tenant, rollout/rollback |

## Procedimiento verificable para investigación y scraping autorizado

1. **Hipótesis primero.** Asociar problema, actor, ruta existente, owner, ticket y AC. Un patrón popular de otra app no demuestra deuda en ContaGest. Registrar `EXISTS|PARTIAL|MISSING|NOT_APPLICABLE` en el HEAD real, con evidencia por función/test.
2. **Fuentes públicas y derechos.** Preferir documentación oficial, changelogs, API pública, demos autorizadas y proyectos OSS con licencia verificable. Guardar URL, fecha ISO de consulta, versión, licencia de código, licencia de datos/medios y restricciones de uso. Una captura pública no implica derecho a clonarla.
3. **Comprobar permiso antes de automatizar.** Revisar términos y [RFC 9309 robots.txt](https://www.rfc-editor.org/rfc/rfc9309.html), permitir solo hosts/rutas explícitos; usar API oficial cuando exista. No eludir login, CAPTCHA, paywalls, bloqueos anti-bot, geobloqueo ni rate limit. No extraer información privada de clientes, pacientes, mascotas, cuentas, sesiones ni credenciales.
4. **Recolector acotado, solo con autorización.** Limitar request count, concurrencia, tamaño de página, cadencia y coste; identificación de User-Agent apropiada, caché de documentación y registro de evidencia; parar ante 401, 403 o 429. No ejecutar spiders ni scripts externos no revisados, ni reutilizar imágenes/código de terceros sin licencia compatible.
5. **Separar hecho de hipótesis.** Cada hallazgo: `FUENTE/FECHA/VERSIÓN/LICENCIA → PATRÓN OBSERVADO → CONTRATO DE CONTAGEST ACTUAL → GAP → RIESGO FODA → DECISIÓN NOW/FOLLOW_UP/REJECT → OWNER/AC/TEST`. Nunca tratar una promesa publicitaria como prueba de comportamiento runtime.
6. **Refactorizar y medir.** Solo adoptar la mínima solución original compatible con las autoridades existentes; no añadir otro ledger, auth, PWA, sistema de estilos o servicio. Medir baseline y delta en p95, LCP/INP/CLS, bundle/queries y tasas de error con fixtures comparables.
7. **Auditoría por profesión.** Finanzas/contabilidad verifica asientos y períodos; operaciones Gym/Vet/Dental/Medicina valida flujo y privacidad; infraestructura/redes y ciberseguridad verifican disponibilidad, auth/tenant y recovery; frontend valida tareas reales/accesibilidad; QA independiente verifica pruebas exact-SHA. Un perfil consultivo no acredita habilitación legal/profesional.

## Resultado esperado del benchmark

Una matriz corta por ticket —nunca un backlog automático sin límites— con propuesta **ADAPT, FOLLOW_UP, REJECT o BLOCKED**, motivo de negocio y de privacidad/licencia, costo de mantenimiento, archivos reales candidatos, riesgos y pruebas. Las oportunidades que impliquen nuevas responsabilidades se proponen al owner para aprobación; no se incorporan silenciosamente al alcance.

**Regla de separación de productos:** solo ContaGest va a Play Store; Control Hípico conserva ejecución local y pruebas físicas/soak propias. WhatsApp Messenger SOURCE sigue NO_GO para lectura y envío automatizados. Las referencias externas nunca modifican esta política.
