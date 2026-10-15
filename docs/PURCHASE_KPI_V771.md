# #771 – KPI de compras por período y moneda

**Alcance:** segunda implementación parcial de #771. Rama exclusiva de esta conversación desde main f7928c6b3d69dc4391e5751f81d058f48562d4e3.

## API

GET /api/v1/reports/operational/purchases?period=2026-10&currency=VES&take=25&skip=0

- Fuente canónica PurchaseInvoice, filtros por tenant autenticado y fiscalPeriod, permiso reports.view.
- Estados issued, paid, overdue; excluye draft y cancelled.
- Agregados sobre subtotal, iva, igtf, retiva y total, agrupados por moneda original y estado. Monedas distintas no se suman. Los Decimal son strings exactos; no hay conversión FX.
- Resumen y drill-down de documentos en transacción PostgreSQL RepeatableRead, orden fijo por issueDate e id, paginación 1 a 100. El snapshot sólo cubre cada petición.
- La salida versionada purchase-kpi-v1 limita campos de documentos; no incluye tenantId, supplierId, notas confidenciales u OCR.
- No implica conciliación bancaria ni cálculo de cuentas por pagar. No crea facturas, asientos ni tablas.

## QA y evidencia

En un entorno Node 22.16 se compiló el helper y el helper existente de ventas con TypeScript 5.8.3. Diez comprobaciones funcionales aisladas pasaron. El hash local del archivo de compras coincide con el blob de GitHub: 09d350c0677a03b108fb2de3f2b7b44903706de2.

Se añadieron diez pruebas a tests/operational_purchase_kpi_v771.test.mjs, conectadas a la suite de informes existente mediante backend/package.json.

Las pruebas oficiales de repositorio, typecheck integral, build, PostgreSQL y E2E siguen NOT_EXECUTED: el entorno no resuelve github.com para clonar. Los checks de GitHub se registrarán según su estado exacto; queued no significa PASS.

Comandos pendientes en checkout autorizado:

- npm ci
- npm run typecheck
- npm --workspace backend run test:reports
- npm run build
- PostgreSQL17 efímero: fixtures multi-tenant, estados, monedas, permisos, precision, dataset golden, HTTP 401/403 y lectura repetible.

## Pendientes de #771

Aún faltan dashboards UX responsive y accesibles, KPIs conciliados de caja y bancos, AR/AP, inventario, impuestos y verticales, filtros por sede, FX formal, exportaciones, estados loading/empty/error y Playwright. Conservar issue #771 abierto hasta completar su DoD.

Rollback: revertir esta rama, sin migraciones ni mutaciones de negocio.
