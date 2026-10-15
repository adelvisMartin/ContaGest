# #771 · KPI de ventas operativas v1 — autoridad canónica

**Alcance incrementado:** endpoint de resumen y drill-down paginado, no un dashboard visual terminado. Baseline `main@22b861cd766d37881f855159a96d3e62b70a22cc`, branch `feat/771-canonical-sales-operational-kpi-20261015`. Issue #771 abierto para resto de KPI/UX. Owner exclusivo: esta conversación.

## Contrato HTTP
`GET /api/v1/reports/operational/sales?period=2026-10&currency=VES&take=25&skip=0`

- Autenticación tenant de servidor y permiso `reports.view` del router; `tenantId` cliente no se acepta. Período obligatorio `YYYY-MM`, se filtra contra `SalesInvoice.fiscalPeriod`, sin cortes ambiguos por zona horaria. Monedas opcionales entre 3 y 8 caracteres alfanuméricos mayúsculos; límite 1–100, desplazamiento 0–1.000.000; Zod strict.
- Agrega únicamente `SalesInvoice` de ese tenant/periodo/moneda con estados `issued`, `paid`, `overdue`; excluye `draft` y `cancelled`. **No es cash collected, ledger posted o revenue recognition GAAP/NIIF**: es el nominal de las facturas comerciales activas. La conciliación se hace contra las mismas filas de `SalesInvoice`, no con analytics events ni fuente agregada paralela.
- `tx.salesInvoice.groupBy({by:['currency','status'], _sum:{subtotal,iva,total}, _count:{_all}})` en PostgreSQL: Decimal se serializa como **string exacto** sin suma JavaScript en float ni conversión FX. Cada moneda/estado es una línea independiente; VES, USD y USDT no se mezclan.
- `tx.salesInvoice.findMany` dentro de la misma transacción `RepeatableRead`, orden determinista por `issueDate desc, id desc`; un extra de paginación indica `hasMore/nextSkip`. La salida incluye versión `sales-kpi-v1`, definición de fórmula/estados/FX, filtros, resumen y documentos sólo con campos allowlisted.
- Fuente drill-down en el mismo endpoint usando el mismo corte/filtro, en vez de enlaces con parámetros ignorados. La paginación offset es estable para ese snapshot **por petición**: no garantiza conservar un snapshot entre peticiones distintas si cambian facturas.

## Pruebas y evidencias
```bash
node --experimental-strip-types --test tests/operational_sales_kpi_v771.test.mjs
npm --workspace backend run test:reports
npm run typecheck
npm run build
```
El test Node se enganchó al gate `test:reports` existente. El helper exacto (Git blob `86b63f8863f3b68dc9cb1203f499bc90ebbb260b`) fue replicado en sandbox aislado y ejecutó 8/8 comprobaciones focalizadas en Node 22.16: múltiples monedas sin fusión, Decimal exacto, invalid statuses/currencies, redacción de campos y manejo de null. **Esto NO equivale** a los ocho tests oficiales registrados, typecheck monorepo, PostgreSQL o E2E.

## Registro pendiente (backlog activo)

| ID | Pendiente real | Criterio de salida |
| --- | --- | --- |
| `771-PG` | NOT_EXECUTED integración Postgres 17 real | dataset golden #643, 2 tenants, moneda VES/USD/USDT, facturas draft/paid/cancelled, corte fiscal y RepeatableRead concurrente, 401/403; comprobar sumas con SQL en DB efímera |
| `771-WEB` | NOT_EXECUTED | grid/charts accesibles, filtros de período y moneda, contraste/teclado/mobile, loading/empty/error/stale data, Playwright Chromium y browser matrix |
| `771-OTHER` | MISSING respecto a DoD completo | compras, AR/AP, caja-bancos, inventario, taxes, verticales, reconciliación e informes CSV/XLSX con ownership de dominio único |
| `771-FX` | EXPLICIT_NO_FX | decidir autoridad de FX a partir de #560 antes de mezclar monedas en métricas convertidas; este endpoint siempre mantiene moneda origen |
| `771-RUNNER` | Sandbox DNS bloquea `github.com` | checkout completo exact SHA, npm ci, lint/typecheck/build/test + material CI o fixture local verificable; cola Actions no es PASS |

## Rollback y política de integración
Revertir módulo KPI, su test, ruta operativa y cambio de `test:reports`; no se alteran ventas, saldos, base de datos, migraciones, workflows ni credenciales. El endpoint actual `/reports/sales` (legacy placeholder) se deja intacto para compatibilidad; su retiro/migración visual corresponde a futura convergencia de #771. El QA manual puede quedar para el final, pero los tests automáticos sin ejecutar quedan explícitos como deuda bloqueante de release.
