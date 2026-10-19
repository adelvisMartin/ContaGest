# #785 · Resolución semántica en posting de ventas y compras

## Authority

La tabla existente `SemanticAccountRoleMapping` y el `ChartAccount` del tenant siguen siendo fuente única. Se extiende `account-role.repository.ts` con `resolveSemanticPostingAccounts(tx, tenantId, roles)`, llamado dentro de la transacción financiera de ventas/compras. La unión SQL exige ambas claves tenant y código; la política pura rechaza configuraciones incompletas, naturaleza errónea, cuenta inactiva, cuenta no imputable o cuenta de otro tenant. No se inventan códigos ni se consulta un catálogo externo.

Los templates de `accounting.service.ts` usan los roles `ar/revenue/vat_output/tax_payable` (ventas) y `cost_of_sales/vat_input/ap` (compras). `tax_payable` se exige sólo si hay IGTF distinto de cero. Se preservan el Decimal exacto, `assertBalanced`, conversión de FX, idempotencia, cierre de período, reversión a partir del histórico y audit-log existentes. El asiento conserva código y nombre efectivamente usados en cada línea, por lo que cambiar el mapping después no reinterpreta registros históricos.

## Rollout y diagnóstico

El endpoint de solo lectura `GET /chart-accounts/role-mappings/readiness?flow=sales|sales_with_tax_payable|purchases` muestra roles pendientes antes de emitir; la página Plan de Cuentas ofrece consulta y vínculo explícito. Una empresa sin todos los roles necesarios recibe `422 ACCOUNT_ROLE_POSTING_NOT_READY`; **no hay fallback silencioso** al template venezolano. El catálogo inicial `VEN-NIF PYME` permanece orientativo, no oficial ni universal. No se modifican datos de producción en QA.

## Verificación y dependencias pendientes

- Contratos ejecutables: `tests/semantic_posting_roles_v785.test.mjs` y `tests/semantic_posting_integration_v785.test.mjs`; regresión anterior `tests/semantic_account_role_mappings_v785.test.mjs`.
- `qa/financial-reconciliation-v559.test.ts` configura roles de fixture en su PostgreSQL descartable y concilia contra los códigos realmente resueltos.
- **PENDIENTE:** PostgreSQL17 from-zero/upgrade, flujo completo sales/purchases con tenant A/B, migración controlada/onboarding de QA fixtures adicionales (#91, #92, #560, #762), browser y CI exact-SHA. No declarar DoD o fusionar hasta el cierre de estos gaps.
- El `main` observado tiene errores ajenos de TypeScript en rutas fiscales (#751) que deben corregirse sin relajar chequeos.

Rollback: revert de rutas/servicio; no se altera ninguna migración ni asiento histórico. El mapping append-only existente permanece como configuración auditable.
