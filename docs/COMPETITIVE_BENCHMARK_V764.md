# Benchmark Venezuela / OSS — issue #764

**Baseline:** `main@01060d9938e282c133e7da18615fd8d9ea3ab195` · **Reviewed:** 2026-10-14 · **SOURCE_REUSE=NONE** · **candidate QA: NOT_EXECUTED**

## Authority and limitations

This is a **decision-support matrix**, not a runtime or competitor reverse-engineering attestation. The external features below are supported by documented product pages; ContaGest states are **inferred from live GitHub backlog issue descriptions**, not from completed PostgreSQL/browser flows. `PARTIAL` means the referenced authority is still being tracked, **not** that partial implementation was demonstrated. `MISSING` is reported by an older ticket baseline and needs current code verification before engineering begins. **No competitor source/assets are copied.**

For the complete machine-readable rows, read [config/competitive-benchmark-v764.json](../config/competitive-benchmark-v764.json). Gate: `node scripts/verify-competitive-benchmark-v764.mjs`; regression: `node --test tests/competitive_benchmark_v764.test.mjs`. This gate verifies *internal consistency and policy*, not competitor availability or runtime status.

## Product provenance and licensing

| Reference | Provenance | License / reuse posture |
|---|---|---|
| Profit Plus | [OFFICIAL](https://www.miprofit.com/) | UNVERIFIED_RESTRICTED — treat as restricted / no code reuse |
| Valery | [OFFICIAL](https://www.valery.com/valery-pro.html) | UNVERIFIED_RESTRICTED — treat as restricted / no code reuse |
| Gálac Administrativo | [OFFICIAL](https://galac.com/productos/administrativo/) | UNVERIFIED_RESTRICTED — treat as restricted / no code reuse |
| Ecologic (identidad pendiente) | UNRESOLVED — no trustworthy identity confirmed | UNVERIFIED — treat as restricted / no code reuse |
| Odoo Community 19 | [OFFICIAL](https://www.odoo.com/documentation/master/legal/licenses.html) | LGPL-3.0 ([source](https://www.odoo.com/documentation/master/legal/licenses.html)) |
| S.A.C. (Sumeria) | [SECONDARY](https://www.sumeria.org.ve/sac/) | UNVERIFIED_RESTRICTED — treat as restricted / no code reuse |
| Bodega / POS (categoría de patrones) | [OFFICIAL](https://www.valery.com/) | UNVERIFIED_RESTRICTED — treat as restricted / no code reuse |
| Fina / Finapartner | [OFFICIAL](https://www.finapartner.com/) | UNVERIFIED_RESTRICTED — treat as restricted / no code reuse |
| ERPNext | [OFFICIAL](https://github.com/frappe/erpnext) | GPL-3.0 ([source](https://erpnext.com/license-trademark)) |
| Dolibarr | [OFFICIAL](https://github.com/Dolibarr/dolibarr) | GPL-3.0-or-later ([source](https://github.com/Dolibarr/dolibarr/blob/develop/COPYING)) |
| Akaunting | [OFFICIAL](https://github.com/akaunting/akaunting) | BSL-1.1 ([source](https://api.akaunting.com/license)) |
| Tryton | [OFFICIAL](https://docs.tryton.org/latest/server/topics/install.html) | GPL-3.0 ([source](https://www.tryton.org/)) |
| Invoice Ninja | [OFFICIAL](https://github.com/invoiceninja/invoiceninja) | ELv2 ([source](https://invoiceninja.github.io/en/legal/license/)) |

Notes: S.A.C. is specifically the `Sistema de Asistencia Comercial` described by Sumeria, **not** the unrelated Dominican product SAC Enterprise. The category `Bodega/POS` is not a company, library or API. `Ecologic` remains unresolved; do not conflate it with unrelated ecological companies or create product-feature claims. Odoo Community vs Enterprise/modules have distinct licenses, so the LGPL evidence applies only to Community 19. Gálac's `SaC` commercial plan is **not** a separate SAC software product.

## Feature-level claim provenance

Every feature row has a `referenceEvidenceLevel` independent from ContaGest's own `assessmentLevel`:

- `DOCUMENTED`: a specific, vendor-maintained URL directly illustrates the cited workflow (not proof of access to the software).
- `PROVISIONAL`: no sufficiently precise official feature URL reviewed; the proposal remains a backlog research hypothesis, **not** a vendor capability claim.
- `UNRESOLVED`: the vendor itself has not been identified, and no feature can be ascribed to it.

The manifest validator rejects a forged `DOCUMENTED` flag without an official HTTPS feature reference and disallows fabricating evidence for provisional/unresolved rows. Ecologic remains unresolved after targeted search; do **not** interpret an unrelated environmental product as this specific vendor. Sumeria publishes the SAC product directly; its provenance is **OFFICIAL**, although its executable license terms are still unverified.

| Feature ID | Vendor feature evidence | Classification |
|---|---|---|
| VEOSS-001 | [Official source](https://www.miprofit.com/productos/) | DOCUMENTED |
| VEOSS-002 | [Official source](https://www.miprofit.com/) | DOCUMENTED |
| VEOSS-003 | [Official source](https://www.valery.com/valery-pro.html) | DOCUMENTED |
| VEOSS-004 | [Official source](https://www.valery.com/valery-pro.html) | DOCUMENTED |
| VEOSS-005 | [Official source](https://galac.com/producto/administrativo-sac-emprendedor-persona-natural/) | DOCUMENTED |
| VEOSS-006 | [Official source](https://galac.com/productos/administrativo/) | DOCUMENTED |
| VEOSS-007 | [Official source](https://galac.com/productos/administrativo/) | DOCUMENTED |
| VEOSS-008 | No feature-level source — not established | UNRESOLVED |
| VEOSS-009 | No feature-level source — not established | PROVISIONAL |
| VEOSS-010 | [Official source](https://www.sumeria.org.ve/sac/) | DOCUMENTED |
| VEOSS-011 | No feature-level source — not established | PROVISIONAL |
| VEOSS-012 | [Official source](https://www.finapartner.com/funcionalidades/programa-para-inventarios/) | DOCUMENTED |
| VEOSS-013 | No feature-level source — not established | PROVISIONAL |
| VEOSS-014 | [Official source](https://docs.frappe.io/erpnext/assets/introduction) | DOCUMENTED |
| VEOSS-015 | [Official source](https://docs.frappe.io/erpnext/selling) | DOCUMENTED |
| VEOSS-016 | No feature-level source — not established | PROVISIONAL |
| VEOSS-017 | No feature-level source — not established | PROVISIONAL |
| VEOSS-018 | No feature-level source — not established | PROVISIONAL |
| VEOSS-019 | No feature-level source — not established | PROVISIONAL |
| VEOSS-020 | No feature-level source — not established | PROVISIONAL |
| VEOSS-021 | No feature-level source — not established | PROVISIONAL |

## Functional comparison

¹ **Statuses are provisional issue/backlog classification, not verified system behavior.** Assess code, API, permissions, PostgreSQL and browser before converting any entry into a PASS/complete implementation.

| ID | Reference | Module | Workflow / pattern | ContaGest status | Priority | Atomic owner |
|---|---|---|---|---|---|---|
| VEOSS-001 | Profit Plus | commercial | Compras/ventas/inventario/tesorería integrados | PARTIAL¹ | P1 | [#753](https://github.com/adelvisMartin/ContaGest/issues/753) |
| VEOSS-002 | Profit Plus | fiscal | Facturación electrónica y controles por vigencia | PARTIAL¹ | P0 | [#751](https://github.com/adelvisMartin/ContaGest/issues/751) |
| VEOSS-003 | Valery | fulfillment | Pedidos con reserva, abonos, conversión parcial y backorder | PARTIAL¹ | P1 | [#754](https://github.com/adelvisMartin/ContaGest/issues/754) |
| VEOSS-004 | Valery | inventory | Inventario por lotes/capas | PARTIAL¹ | P1 | [#755](https://github.com/adelvisMartin/ContaGest/issues/755) |
| VEOSS-005 | Gálac Administrativo | tax | Libros compras/ventas IVA y retenciones | PARTIAL¹ | P0 | [#782](https://github.com/adelvisMartin/ContaGest/issues/782) |
| VEOSS-006 | Gálac Administrativo | inventory | Lotes y vencimientos | PARTIAL¹ | P1 | [#755](https://github.com/adelvisMartin/ContaGest/issues/755) |
| VEOSS-007 | Gálac Administrativo | analytics | Dashboard con conciliación a datos reales | PARTIAL¹ | P1 | [#771](https://github.com/adelvisMartin/ContaGest/issues/771) |
| VEOSS-008 | Ecologic (identidad pendiente) | unknown | Referencia de proveedor no identificada de forma inequívoca | NOT_APPLICABLE¹ | N/A | [#764](https://github.com/adelvisMartin/ContaGest/issues/764) |
| VEOSS-009 | Odoo Community 19 | localization | Configuración fiscal/localización Venezuela por reglas efectivas | PARTIAL¹ | P0 | [#717](https://github.com/adelvisMartin/ContaGest/issues/717) |
| VEOSS-010 | S.A.C. (Sumeria) | operations | Multiempresa/multimoneda y segregación de acceso | PARTIAL¹ | P1 | [#641](https://github.com/adelvisMartin/ContaGest/issues/641) |
| VEOSS-011 | Bodega / POS (categoría de patrones) | retail | Checkout con control de stock y caja | PARTIAL¹ | P1 | [#765](https://github.com/adelvisMartin/ContaGest/issues/765) |
| VEOSS-012 | Fina / Finapartner | inventory | Alertas de reposición y control de inventario | PARTIAL¹ | P1 | [#756](https://github.com/adelvisMartin/ContaGest/issues/756) |
| VEOSS-013 | Fina / Finapartner | banking | Conciliación de movimientos bancarios | PARTIAL¹ | P1 | [#743](https://github.com/adelvisMartin/ContaGest/issues/743) |
| VEOSS-014 | ERPNext | assets | Activos fijos desde adquisición hasta baja | PARTIAL¹ | P1 | [#759](https://github.com/adelvisMartin/ContaGest/issues/759) |
| VEOSS-015 | ERPNext | sales | Order→fulfillment→invoice | PARTIAL¹ | P1 | [#753](https://github.com/adelvisMartin/ContaGest/issues/753) |
| VEOSS-016 | Dolibarr | crm | Prospecto→oportunidad→presupuesto | MISSING¹ | P2 | [#760](https://github.com/adelvisMartin/ContaGest/issues/760) |
| VEOSS-017 | Dolibarr | procurement | Proveedor→solicitud→pedido→recepción | PARTIAL¹ | P1 | [#757](https://github.com/adelvisMartin/ContaGest/issues/757) |
| VEOSS-018 | Akaunting | accounting | Gastos/facturas/reportes contables | PARTIAL¹ | P1 | [#744](https://github.com/adelvisMartin/ContaGest/issues/744) |
| VEOSS-019 | Tryton | architecture | Módulos de venta/compra con contratos explícitos | PARTIAL¹ | P1 | [#653](https://github.com/adelvisMartin/ContaGest/issues/653) |
| VEOSS-020 | Invoice Ninja | projects | Horas/proyectos→factura con idempotencia | MISSING¹ | P2 | [#761](https://github.com/adelvisMartin/ContaGest/issues/761) |
| VEOSS-021 | Invoice Ninja | client-portal | Portal cliente para presupuestos y facturas | PARTIAL¹ | P1 | [#769](https://github.com/adelvisMartin/ContaGest/issues/769) |

## Decisions for engineering

- For commercial transitions (#753/#754/#757/#769), preserve canonical tenant, stock, financial/posting and document authorities. Carry idempotency, partial-fulfillment, inventory reservation and corrections as explicit server-side transitions; do not clone vendor screens.
- For Venezuela (#717/#751/#775/#782), distinguish vendor marketing from **law**: a tax rate, filing rule or electronic invoicing claim needs independently dated primary fiscal provenance and a reviewed rule version.
- For CRM and project/time (#760/#761), do not fork `Client`, `SalesInvoice` or ledger state. Portal and UX ideas remain downstream of RBAC/tenant controls.
- For OSS and licenses (#656/#707), GPL/AGPL/LGPL/BSL/Elastic work is research only until a separate written compliance review. This change contains no external code or assets.
- For undocumented vendor API claims, the matrix records **FLOW/UI/ARCH** patterns, never hypothetical endpoints. A real integration would require provider docs + auth/tenancy threat model under #772.

## Unresolved / follow-up

**Ecologic** cannot be matched confidently to a Venezuelan administrative software vendor using the available reliable primary references. Its single row is `NOT_APPLICABLE` **to implementation at this time**, tracked by #764 for identity research; this does **not** prove the competitor itself is irrelevant. S.A.C. workflow provenance is vendor-maintained; its software license terms and API details remain unverified, so code reuse/integration remain prohibited. The overall ticket should remain open until identity/provenance and actual ContaGest code/status audit are reconciled and the exact-SHA gate evidence is complete.

## Evidence and safe reproduction

Run `node scripts/verify-competitive-benchmark-v764.mjs` and `node --test tests/competitive_benchmark_v764.test.mjs`. CI/Playwright/PostgreSQL are **not substitutions** for product analysis; for this docs+contract increment, financial writes, login, DB migration and browser flows are **NOT_APPLICABLE**, while repository full lint/build and remote CI remain independently tracked. No direct production env, tenant data, secret, customer info or competitor code is read.
