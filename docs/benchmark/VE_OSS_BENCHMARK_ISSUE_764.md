# Benchmark venezolano + OSS — issue #764

**Corte de investigación:** 2026-10-14 (UTC-05). **Baseline de código:** `main@01060d9938e282c133e7da18615fd8d9ea3ab195`. **Autoridad:** #764, dependencias #707, #708, #717 y #624. **SOURCE_REUSE=NONE** para todas las filas. **No se copió código, marca, interfaz, documentación protegida ni reglas tributarias de terceros.**

## Método y límites

1. Evidencia externa = URL oficial del fabricante o repositorio/licencia del proyecto. Describe una **capacidad anunciada o documentada**, no un flujo probado en su instalación; ningún competidor se ejecutó ni se hizo scraping autenticado.
2. Evidencia interna = modelos y servicios inspeccionados en el baseline (`backend/prisma/schema.prisma`, `backend/src/modules/accounting/accounting.service.ts`) y el gap/owner en un issue existente. Los nombres de módulos de `commercial.routes.ts` **no** demuestran un flujo terminado. `docs/benchmark/benchmark-matrix.v1.json` es histórico (baseline 2026-09-27), no evidencia runtime actual.
3. **EXISTS**: evidencia de implementación del *workflow exacto* revisado; **PARTIAL**: modelos/primitivas existen, pero falta un contrato o E2E; **MISSING**: falta el modelo/servicio para el workflow específico en la fuente canónica inspeccionada y existe issue que lo delimita; **N/A**: producto no identificado inequívocamente, modalidad comercial en vez de producto separado, o función fuera del alcance. Estas clasificaciones son **SOURCE_REVIEW** y no equivalen a pruebas funcionales.
4. **P0/P1/P2** son prioridades del issue propietario (si existe). No se crean issues nuevos por similitud competitiva. **Propietario = número de issue**, no la ventana/chat que lo implemente. Las referencias sirven como señales de producto, **nunca** como fuente legal venezolana.
5. Cuando una licencia de código no está publicada o el producto está comercialmente licenciado, se registra **no acreditada / comercial** y se prohíbe reutilizar código. `#656` es autoridad de revisión de licencias antes de cualquier futura incorporación. Las APIs quedan bajo contrato neutral de `#772`, no implican permiso de integración automática.

## Catálogo de procedencia y licencias

| Referencia exacta | Procedencia primaria, consultada 2026-10-14 | Licencia del software / tratamiento |
| --- | --- | --- |
| Profit Plus Administrativo | [miprofit.com](https://www.miprofit.com/) y [productos](https://www.miprofit.com/productos/) | Comercial; licencia abierta de código **no acreditada**. Sólo benchmark |
| Valery Profesional | [Valery Profesional](https://valery.com/valery-pro.html) | Comercial; licencia abierta de código **no acreditada**. Sólo benchmark |
| Gálac Administrativo / Contabilidad | [Gálac Administrativo](https://galac.com/productos/administrativo/) y [Contabilidad](https://galac.com/productos/contabilidad/) | Comercial (on-premise / SAC / cloud); código **no licenciado para reutilización** |
| Ecologic | **Proveedor y producto no identificados con evidencia oficial inequívoca**; no atribuir capacidades a una empresa homónima | **UNVERIFIED**; exclusivamente N/A hasta obtener fabricante/URL verificables |
| SAC | [Gálac, modalidades de licencia](https://galac.com/productos/administrativo/) | En esta referencia documentada, **SAC = Software al Consumo**, modelo de licencia de Gálac; **no es otro ERP independiente** |
| Bodega/POS venezolana: BodegApp / OmniStock | [OmniStock / BodegApp](https://omnistock.com.ve/) | Software comercial; licencia abierta **no acreditada** |
| Bodega/POS venezolana: SiraPOS | [SiraPOS](https://sirapos.com/) | Software comercial; licencia abierta **no acreditada** |
| Finpartner (Portugal) | [App oficial](https://finpartner.pt/app-finpartner/) | Plataforma comercial/servicio contable; licencia de código **no acreditada**. No trasladar fiscalidad portuguesa a Venezuela |
| ERPNext | [frappe/erpnext](https://github.com/frappe/erpnext) y [Sales Order](https://docs.frappe.io/erpnext/sales-order) | **GPL-3.0**: benchmark sin copiar código |
| Dolibarr | [Dolibarr/dolibarr](https://github.com/Dolibarr/dolibarr) y [COPYRIGHT](https://github.com/Dolibarr/dolibarr/blob/develop/COPYRIGHT) | **GPL-3.0-or-later**: benchmark sin copiar código |
| Akaunting | [akaunting/akaunting](https://github.com/akaunting/akaunting) | **BSL** (revisar términos/versión exactos antes de cualquier integración): benchmark sin copiar código |
| Odoo 19 Community / Enterprise | [licencias Odoo 19](https://www.odoo.com/documentation/master/legal/licenses.html) y [Accounting 19](https://www.odoo.com/documentation/19.0/applications/finance/accounting.html) | Community **LGPL-3.0**; Enterprise **licencia comercial Odoo Enterprise**. No asumir que todo módulo de la documentación es Community |
| Tryton | [Tryton](https://www.tryton.org/), [repositorio](https://github.com/tryton/tryton) y [servidor histórico, GPL-3](https://github.com/tryton/trytond) | **GPL-3.0-or-later** (componentes principales; verificar módulo concreto): benchmark sin copiar código |
| Invoice Ninja 5 | [repositorio y declaración de licencia](https://github.com/invoiceninja/invoiceninja) | **Elastic License**, source-available, **no** tratar como MIT/Apache/OSS permisivo |

> **Provenance incompleta:** `Ecologic` carece de identidad confirmada, por lo que no se le asignan funciones ni licencia ficticias. Si aparece la URL original, ampliar este catálogo antes de cambiar el estado N/A. Para nombres ambiguos como `SAC`, no inventar un proveedor nuevo. La ausencia de licencia de código pública impide reutilización, pero no impide describir funcionalidades anunciadas.

## Matriz funcional: módulo → producto → feature / workflow / API → estado ContaGest → prioridad → licencia → estrategia → ticket owner

En la columna «Licencia» las abreviaturas **COM** = comercial/no licencia de código acreditada; **GPL** = GPL-3; **LGPL/EE** = Odoo Community/Enterprise; **BSL** = Akaunting Business Source License; **EL** = Elastic License. Todos los renglones tienen **SOURCE_REUSE=NONE**. Cada URL de producto está arriba para evitar links duplicados.

| Módulo | Producto | Feature / workflow de referencia | ContaGest | Prioridad | Licencia | Estrategia / evidencia interna y owner |
| --- | --- | --- | --- | --- | --- | --- |
| Comercial | Profit Plus | ventas, compras, inventario y tesorería integrados | PARTIAL | P1 | COM | Mantener `SalesInvoice`, `PurchaseInvoice`, `InventoryMovement`, `BankMovement` como primitivas; autoridad financiera #637, comercial #708 |
| Comercial | Valery | pedido con reserva, abonos, facturación parcial y backorder | MISSING | P1 | COM | No hay `SalesOrder` en schema canónico; implementar estados/snapshots y fulfillment propio #753 / #754 |
| Inventario | Gálac Administrativo | lote + vencimiento y trazabilidad | PARTIAL | P1 | COM | Existe `InventoryLot`, falta allocation/FEFO por ubicación según #755; no copiar UX |
| Fiscal | Gálac IVA y Renta (suite) | libros compras/ventas y retenciones | PARTIAL | P0 | COM | Modelo fiscal propio sujeto a provenance legal #751 y libros deterministas #782; prohibido derivar tasas de Gálac |
| Banca | Gálac Contabilidad | conciliación de extractos y movimientos | PARTIAL | P1 | COM | `BankAccount`/`BankMovement` existen; import/matching/reversos #743 |
| Licenciamiento | Gálac SAC | software al consumo (modalidad de pago) | N/A | P2 | COM | No es un producto independiente ni backlog ERP adicional; gobierno de planes ya pertenece a core comercial |
| Investigación | Ecologic (no desambiguado) | funcionalidad/API no acreditada | N/A | P2 | UNVERIFIED | **No implementación**; requerir URL oficial y licencia verificable antes de nueva clasificación, #764 |
| Retail | BodegApp (OmniStock) | cobro mixto VES/USD, venta por peso, fiado | PARTIAL | P1 | COM | Diseñar flujos POS/caja/cliente sobre inventario y finanzas canónicos, sin nuevo ledger, #765 / #744 |
| Retail | SiraPOS | caja/arqueo, lote/expiry y crédito cliente | PARTIAL | P1 | COM | Flujos sujetos a autoridad de caja/inventario y cierre, #765 / #755 / #744 |
| Colaboración | Finpartner | app/web: compartir documentos, agendar reuniones y pagar servicios | MISSING | P1 | COM | No hay autoridad `ClientAccountantPortal` en schema canónico; hub privado server-side y RBAC #745 |
| Ventas | ERPNext | Quotation → Sales Order → Delivery Note → Invoice → Payment Entry | MISSING | P1 | GPL | Diseñar orquestación propia, evitar efecto financiero doble; #753, #754 y posting #637 |
| Inventario | ERPNext | pick, delivery, stock reservation y consumo | PARTIAL | P1 | GPL | `InventoryMovement` existe, sin cadena pick/delivery confirmada; #754 / #755 |
| CRM | Dolibarr | contactos + cotizaciones + oportunidades y pedidos | MISSING | P2 | GPL | `Client` existe; `Lead` / `Opportunity` / `Quotation` no aparecen en schema; #760 y #753 |
| Tesorería | Akaunting | facturación y seguimiento de cobros/pagos | PARTIAL | P1 | BSL | `SalesInvoice`/`PurchaseInvoice` sí, falta allocation/ageing/dunning #744; usar servicio propio |
| Contabilidad | Odoo 19 | partida doble, fiscal periods y reportes por ejercicio | PARTIAL | P1 | LGPL/EE | Ledger y `accounting.service.ts` existen, reconciliación y reglas especializadas #637 / #643 |
| Tributos | Odoo 19 | impuestos en documentos y posting a cuentas | PARTIAL | P0 | LGPL/EE | Rule provenance y perfil fiscal tenant #751 / #774; sin tasa hardcoded ni normatividad heredada |
| Compras | Tryton | RFQ → purchase → recepción → factura de proveedor | MISSING | P1 | GPL | `PurchaseInvoice` existe; `PurchaseOrder` no está en schema; #757 |
| Proyectos | Tryton | project cost-to-invoice / timesheets | MISSING | P2 | GPL | No `Project`/`Timesheet` en schema canónico; #761 |
| Portal cliente | Invoice Ninja | factura/presupuesto y visibilidad de cliente | MISSING | P1 | EL | No introducir un segundo ledger ni portal sin autorización; owner #745, integraciones #772 |
| Documentos | Invoice Ninja | cotización/documento emitido + pago y revisiones | PARTIAL | P1 | EL | `SalesInvoice` existe; notas, reversos, snapshots y lifecycle fiscal #769 / #762 |

**Interpretación importante:** `MISSING` califica **el flujo completo de la fila**, no toda la funcionalidad del sector (por ejemplo, existen facturas, pero no se constató una autoridad de Sales Order). `PARTIAL` no significa «prueba pasada»; indica sólo que la base inspeccionada aporta al flujo.

## Decisiones de arquitectura, API y UX (no se copian implementaciones)

| Patrón observable | Decisión ContaGest | Autoridad y control |
| --- | --- | --- |
| ERPNext y Odoo separan documento comercial, entrega, facturación y pago | Máquinas de estados propias con snapshots inmutables, idempotency keys, efecto monetario único y reversos, nunca update/delete de asientos posted | #753, #754, #637, #769 |
| Valery documenta backorder y abonos | Mostrar *pedido confirmado → disponible/reservado → entregado → facturado → pendiente* con acciones accesibles y errores reales | #753 / #754; pruebas de concurrencia y parcialidad |
| Gálac y POS locales dan alto peso a caducidad, caja y multimoneda | FEFO/lotes y cierres de caja propios; Decimal y conversión FX rastreable; sin tasas/fiscalidad inferidas del fabricante | #755 / #765 / #637 / #751 |
| Finpartner expone documentos/reuniones/pagos en una app de cliente | Portal mínimo separado de la vista interna, documentos con permisos por tenant/actor y auditoría; no crear autoridad financiera paralela | #745 / #848 / #651 |
| Odoo, ERPNext, Dolibarr y Tryton muestran orquestación modular | Core contable/tenant único; verticales y adapters sólo consumen servicios; no acoplar dominio a provider | #653 / #772 / #707 |
| ERPNext tiene documentación pública de Sales Order y Delivery Note | Crear equivalentes internos neutrales; contratos API versionados, auth tenant server-derived y estados explícitos | #753 / #754; ver [Delivery Note](https://docs.frappe.io/erpnext/delivery-note) |
| Potenciales APIs de Odoo/ERPNext/Dolibarr/Akaunting/Invoice Ninja | **No se acredita un contrato/API utilizable aquí**. Inventariar endpoint documentado, ToS, OAuth/API keys, límites, idempotencia, retry, DLQ, firmas/replay y pruebas negativas antes de adaptar | #772; **no llamadas externas ni claves añadidas** |
| Comparativa de estados y flujos | Reusar **Cg*** y estilos canónicos existentes. No importar HTML/CSS/branding; acciones con disabled/loading/error/success y responsive en ambos temas | #773 / #619–#621 |

## Cobertura, limitaciones y siguientes gates

- **Provenance:** 14 entradas nominales (incluye categoría Bodega/POS ejemplificada por dos productos), fuentes oficiales y licencias clasificadas con incertidumbre explícita; `Ecologic` queda desambiguación **pendiente**. `SAC` es modalidad de Gálac, no un segundo producto.
- **Backlog:** todas las decisiones P0/P1/P2 se vinculan a owners existentes o se clasifican N/A; **no** se crea un issue redundante. Los owners #751, #753, #754, #755, #757, #743, #744, #745, #760, #761, #765, #769, #772 ya existen y no se reclaman en este trabajo.
- **Evidencia de código:** lectura documental del baseline exacto; **sin** ejecutar consola UI, npm, PostgreSQL, browser ni integración. La matriz no promueve estados a VERIFIED/QA PASS.
- **Licencias:** cero assets/deps/scripts terceros importados; cualquier futura reutilización de MIT/Apache requiere `#656` + NOTICE/atribución, y GPL/BSL/Elastic/comercial permanece benchmark-only.
- **Limitación:** la consulta pública no confirmó proveedor concreto `Ecologic`; su estado es N/A/UNVERIFIED y no se inventa licencia. Matriz válida como entregable de investigación sujeto a revisión del owner.
- **Validación exigida para cierre:** revisar referencias, matriz y owners vivos al SHA candidato; ejecutar gate documental/arquitectónico del repositorio y CI requerido. E2E/bases de datos son **NOT_APPLICABLE a esta entrega sin código runtime**; el QA de los tickets derivados permanece en sus issues.
