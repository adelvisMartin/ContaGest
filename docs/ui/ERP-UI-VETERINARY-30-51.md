# 30/51 · Veterinaria · flujo financiero integrado

## Objetivo

Conectar el acto clínico veterinario con el ERP sin crear una segunda autoridad de inventario, ventas o contabilidad.

Flujo canónico:

**estimación → autorización → atención → consumos reales → borrador de factura**

## Autoridades

- **Clínica:** `CarePatient`, `CareEncounter`, `CareHospitalization`, `CarePrescription`.
- **Inventario:** `Product` + `InventoryMovement`.
- **Autorización:** `CareConsent` con kind `veterinary-financial-authorization`.
- **Comercial:** `SalesInvoice`.
- **Contabilidad:** módulo Ventas. El flujo veterinario no crea ni postea `LedgerEntry`.

## Estimación

`VeterinaryFinancialCase` conserva snapshot JSON, subtotal, impuesto, total y SHA-256.

Las líneas de servicio aceptan precio/tasa explícitos. Las líneas de producto sólo envían `productId + quantity`; el backend resuelve `Product.price` y `Product.taxRate` dentro del tenant. Los totales usan `calculateInvoiceTotals`, la misma política decimal del módulo Ventas.

Los productos estimados no se convierten automáticamente en cargos finales: al facturar se usan servicios autorizados + consumos clínicos reales seleccionados.

## Autorización

Sólo un caso `proposed` puede pasar a `authorized`. Antes de firmar, el backend vuelve a calcular el SHA-256 del snapshot persistido y rechaza cualquier drift.

El servidor crea un `CareConsent` firmado con:

- hash de la estimación;
- importe y moneda autorizados;
- nombre del firmante;
- texto de autorización y hash del texto;
- atestación tipada;
- actor y correo del contexto autenticado;
- fecha/hora server-side.

El navegador no suministra actor ni timestamp.

## Atención

Un caso autorizado debe vincularse exactamente a una fuente clínica:

- `CareEncounter` firmado, o
- `CareHospitalization` no cancelada.

La fuente debe pertenecer a la misma mascota y tenant. La autorización vinculada debe seguir en estado `signed`; una autorización no vigente bloquea atención y facturación.

## Consumos reales

Los consumos elegibles provienen de `InventoryMovement.source='veterinary-prescription'`.

`VeterinaryFinancialConsumptionLink` garantiza que un mismo movimiento no pueda facturarse en dos casos. Vincular/facturar **no genera movimientos nuevos ni vuelve a descontar inventario**.

## Factura

El endpoint de factura exige permisos de ventas e inventario y vuelve a validar:

- estado `attended`;
- integridad SHA-256 del snapshot de estimación;
- pertenencia de consumos a la mascota/acto;
- ausencia de vínculos previos.

El resultado es una `SalesInvoice` **status='draft'** calculada con `calculateInvoiceTotals`.

El snapshot comercial registra `accountingPosting='not-performed'`.

**Emisión, posting, asiento y anulación siguen siendo responsabilidad exclusiva del módulo Ventas.**

Ventas impide además eliminar un borrador que siga vinculado a `VeterinaryFinancialCase`, preservando provenance.

## Persistencia y seguridad

La migración agrega:

- `VeterinaryFinancialCase`;
- `VeterinaryFinancialConsumptionLink`;
- FKs a Tenant/CarePatient/CareConsent/CareEncounter/CareHospitalization/SalesInvoice/InventoryMovement;
- restricciones de moneda/estado;
- unicidad anti doble facturación;
- RLS habilitado;
- acceso directo revocado a `anon` y `authenticated`.

## UI

`VeterinaryWorkspace` agrega una sola pestaña `Finanzas` cuyo owner es `VeterinaryFinancialPanel`.

El panel cubre:

- estimación;
- autorización;
- vínculo de atención;
- selección explícita de consumos reales;
- creación de factura borrador.

No usa lifecycle DOM imperativo.

## QA

`tests/erp_ui_veterinary_financial_flow_30_51.test.mjs` bloquea regresiones de pricing server-side, evidencia, tenancy, doble facturación, posting indebido y ownership UI.

Runtime/PostgreSQL/browser se clasifican según la evidencia real de Actions del SHA candidato. Si los jobs terminan antes de ejecutar steps, el estado es `BLOCKED_INFRASTRUCTURE`, no PASS ni FAIL de código.
