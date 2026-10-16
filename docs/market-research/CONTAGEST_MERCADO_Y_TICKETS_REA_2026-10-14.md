# ContaGest — mercado actual y tickets canónicos para REA

**Corte de fuentes:** 14 de octubre de 2026. **Propósito:** ampliar el benchmark dirigido de #764 y convertir hallazgos en verificaciones/tickets sin crear un ERP paralelo. Esto no es una lista exhaustiva de todo el mercado ni una auditoría funcional de cada competidor.

## Límites del análisis y de REA

REA no clona un sistema ni su código. Según el alcance del PR #997, permite capturar evidencia de la página seleccionada, ordenar referencias y sugerir brechas. La decisión de producto y la implementación deben seguir los tickets canónicos, con código propio, licencia revisada y evidencia sobre SHA concreto. La documentación web no demuestra lógica backend ni funciones que no se hayan probado.

No afirmar `EXISTS`, `MISSING`, paridad fiscal o producción sobre el estado local compartido: la carpeta local no tiene `HEAD` resoluble. El `main` remoto consultado para este corte fue `5523608b3ca7f98727d043902ae7d47dd09880c5`; confirmar de nuevo antes de ejecutar trabajo.

## Mapa curado de referentes

| Producto | Evidencia pública a cotejar | Flujos/capacidades candidatos | Dueño ContaGest existente |
| --- | --- | --- | --- |
| [a2 Administrativo Contable](https://a2.com.ve/producto/a2-administrativo-contable/) | Página oficial del producto | Ventas/compras, inventario y almacenes, cuentas por cobrar/pagar, bancos/tesorería, multi-moneda, permisos e integración con contabilidad | #753, #754, #738, #755, #743, #717, #751, #785 |
| [Valery](https://www.valery.com/) | Sitio del fabricante | Productos de administración/POS, perfiles de uso, moneda y dispositivos fiscales; sus afirmaciones de cumplimiento requieren fuente legal aparte | #717, #751, #765 |
| [Profit Plus](https://www.miprofit.com/productos/) | Página de productos | Administrativo + contabilidad + nómina, reportes e integración entre módulos | #707/#764; mapear gaps a autoridad existente por módulo |
| [Alegra Venezuela](https://www.alegra.com/venezuela/contabilidad/) | Página oficial de localización/producto | Contabilidad en nube, ventas/compras, inventario, banco y reportes | #743, #753–#765, #771; vigencia/capacidades a confirmar en fuente oficial |
| [SAINT](https://saintnet.com/downloads/Manuales/Manual_basico_Annual_Professional_mas.pdf) | Manual de versión, no prueba de capacidad vigente | Administración, inventario, caja/contabilidad y nómina | #764; usar solo como referencia histórica hasta verificar versión soportada |
| [Wink POS](https://wink-pos.com/) y [post de lanzamiento suministrado](https://x.com/metavarce/status/2110046379477434839?s=46) | Sitio del proveedor y mensaje social; claims comerciales, no prueba independiente | Venta rápida, vuelto, varias monedas, rebaja de stock, gastos, usuarios/reportes y experiencia móvil; el proveedor distingue recibo de factura fiscal | #765 con #753/#754, #755/#756, #743, #717/#751 y #785 |
| [Odoo](https://www.odoo.com/app/accounting-features), [ERPNext](https://docs.erpnext.com/index), [Dolibarr](https://www.dolibarr.org/) | Sitios/documentación de fabricantes y proyectos | Flujo documento-a-documento, conciliación, cierre, inventario, API e informes | #707/#764 y tickets de dominio existentes |
| Gálac, Ecologic, SAC, Bodega, Finpartner | Referencias nombradas ya en #764 | Localización venezolana, administración, facturación y operación comercial | #764 debe verificar producto/versión y fuentes antes de afirmar funciones |

### Lectura de producto

Los anuncios no son especificaciones contractuales. Para cada función guardar URL, proveedor, versión/fecha, tipo de evidencia (`observed`, `official-doc`, `marketing-claim`), captura saneada, licencia y límites. No reutilizar marcas, CSS, textos, activos, código ni datos. `SOURCE_REUSE=NONE` salvo revisión explícita de licencia/provenance.

### Flujo diferenciador a verificar en #765

Usar el referente Wink como benchmark de fricción operativa, no como autoridad contable:

1. abrir turno/caja y mostrar usuario/sede/caja;
2. localizar producto por búsqueda/barcode y agregar al carrito;
3. presentar precio, impuestos, moneda/tasa y total antes de confirmar;
4. registrar pago simple/mixto y calcular vuelto con Decimal;
5. al confirmar, crear un solo documento, descontar el stock correcto y producir la contabilización definida por dominio;
6. imprimir/descargar comprobante y etiquetar claramente si es recibo informativo o documento fiscal autorizado;
7. registrar gasto/devolución/anulación con flujo de reverso trazable;
8. cerrar caja y conciliar efectivo, pagos digitales, banco y ledger;
9. probar rol cajero/gerente, falta de conectividad, doble clic/reintento y dos ventas simultáneas.

El flujo se acepta solo si conecta autoridades existentes: ventas #753/#754, inventario #738/#755/#756, fiscal #717/#751+, pagos/ledger #637/#643, banking #743 y POS #765. No crear issue nuevo para repetir esos dominios; #765 ya declara el recorrido E2E como DoD.

## Registro de alcance para REA

- PR #997 (**abierto** al corte): integración local opcional/matriz preparada; no se ha acreditado aquí instalación ni captura REA ejecutada.
- #764 (**abierto**): dueño de competitive intelligence y clasificación de brechas. Añadir estas fuentes al ticket y mapear cada brecha a un issue existente antes de crear otro.
- #765 (**abierto**): dueño de POS/Bodega y flujo transaccional integrado. Esta ampliación refina sus escenarios de aceptación; no sustituye el issue.
- #835/#707: authorities padre de expansión ERP y reuso de fuentes.

## Estado de evidencia

| Afirmación | Estado |
| --- | --- |
| El mercado tiene productos contables/ERP venezolanos y globales en estas categorías | `PASS` como muestra curada de páginas oficiales consultadas; no censo exhaustivo |
| Cada producto fue recorrido funcionalmente de inicio a fin | `NOT_EXECUTED` |
| Paridad fiscal/SENIAT o cumplimiento legal de cualquier producto | `NOT_EXECUTED` / fuera del alcance comercial |
| Paridad de ContaGest demostrada en candidate SHA exacto | `NOT_EXECUTED`; usar browser, API y fixtures definidos en tickets canónicos |
| REA instalado/ejecutado en equipo del usuario | `NOT_EXECUTED` |

## Coordinación con el benchmark activo

Al cotejar GitHub el 2026-10-15, #764 tenía un claim exclusivo activo y PR #1004 de matriz comparativa (`f7f65de711a12425099db888bae228c1a00ca83e`), que reemplazó PR #1003 como autoridad. No abrir otro issue, editar ese PR ni añadir trabajo a su claim; estas referencias quedan como complemento local para reconciliar cuando se libere la autoridad. #765 es el dueño existente del flujo POS integrado y tiene escenarios ampliados en su ticket.
