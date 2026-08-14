# ContaGest-VE ERPUI Migration Matrix v11.17

## Purpose

Migrate the complete ERP to one visual contract without changing observable business behavior. The migration is intentionally incremental: each screen keeps its route, IDs, data attributes, service calls, state contracts and event handlers while layout/typography/table/card primitives move toward `ErpUi` and `frontend/src/styles/erp-system.css`.

## Non-negotiable migration rules

1. `frontend/src/styles/erp-system.css` is the only styling entrypoint for new ERP UI work.
2. Do not add another versioned override stylesheet.
3. Keep Inter as the only branded text family; monospaced figures/code use the system monospace token only.
4. Preserve existing `id`, `data-route`, `data-backend-action`, form names and service/store interactions.
5. Do not redesign or replace the existing authentication flow during ERPUI cleanup.
6. Mobile-first behavior must work at phone, tablet portrait, tablet landscape and desktop sizes.
7. iPhone/iPad installed-PWA behavior must respect safe areas, 44px touch targets and 16px focused form controls.
8. Tables own horizontal scrolling; the document must not overflow horizontally.
9. Security hardening is progressive: CSP remains Report-Only until violation telemetry shows the remaining inline/style/script dependencies are safe to remove.
10. Each logical migration remains a separate commit so any module can be reverted independently.

## Completed foundation

- canonical typography tokens and weights;
- iOS safe-area and touch/input baseline;
- reusable `ErpStack`, `ErpRow`, `ErpGrid`, `ErpCard`, `ErpSection`, `ErpButton`, `ErpField`, `ErpBadge`, `ErpEmptyState`, `ErpDataTable`;
- accessible icon-only actions and destructive button state;
- canonical PWA install surface without runtime style injection or `innerHTML`;
- WebKit desktop/iPhone Playwright projects;
- CSP Report-Only collector and dedicated limiter;
- security CI baseline for secrets, validation, rate limits, CSP telemetry and PWA DOM sinks;
- managed-auth benchmark document while retaining ContaGest authentication.

## Module migration matrix

| Module/page | Risk tier | ERPUI state | Notes / next gate |
|---|---:|---|---|
| BusinessRulesPage | Low | **Migrated** | Canonical sections/grid/key-value rows. |
| AccountingStandardsPage | Low | **Migrated** | Canonical cards/table; existing refresh/import handlers preserved. |
| ModuleMaturityPage | Low | **Migrated** | Canonical tier cards/grid. |
| HelpPage | Low | **Migrated** | Canonical section/table. |
| SupportCtaPage | Low | **Migrated** | Canonical cards; WhatsApp action preserved and escaped. |
| HistoryPage | Medium | **Migrated** | Canonical table/actions; PDF/duplicate/delete/export handlers preserved. |
| ClientsPage | Medium | **Migrated** | Canonical shell/table/actions; create/sync/delete/cotizador behavior preserved. |
| SuppliersPage | Medium | **Migrated** | Canonical shell/table/actions; purchase route and persistence behavior preserved. |
| DashboardPage | Medium | Planned | Normalize KPI hierarchy, grid density and responsive priorities. |
| AnalyticsPage | Medium | Planned | Normalize KPI/chart shells; preserve analytics service contracts. |
| ReportsPage | Medium | Planned | Unify filters/report table/export actions. |
| TasksPage | Medium | Planned | Normalize list/table/actions without changing task state. |
| InventoryPage | Medium | Planned | Normalize filters, forms, stock table and action density. |
| KardexPage | Medium | Planned | Canonical financial table and numeric alignment. |
| PurchasesPage | Medium | Planned | Preserve purchasing flow and supplier integration. |
| SalesPage | Medium | Planned | Preserve sales flow, fiscal totals and actions. |
| OrderTrackingPage | Medium | Planned | Normalize status timeline/cards. |
| BankingPage | Medium | Planned | Financial numeric alignment and responsive table work. |
| PayrollPage | High | Planned | Characterization tests first; preserve payroll calculations and contracts. |
| HrDashboardPage | Medium | Planned | Normalize HR KPIs/cards before payroll detail screens. |
| ChartAccountsPage | High | Planned | Preserve accounting hierarchy and plan-of-accounts interactions. |
| LedgerPage | High | Planned | Financial-table migration only after characterization tests. |
| GeneralLedgerPage | High | Planned | Preserve debit/credit totals and report semantics. |
| TrialBalancePage | High | Planned | Preserve accounting equality and numeric precision. |
| WorksheetPage | High | Planned | Preserve worksheet calculations and export behavior. |
| FinancialStatementsPage | High | Planned | Preserve statement grouping/totals and reporting semantics. |
| AccountingClosePage | High | Planned | Close-period flow requires regression characterization before UI migration. |
| SalesBookPage | High | Planned | Preserve fiscal columns and tax totals. |
| TaxesPage | High | Planned | Preserve tax logic and regulatory labels. |
| RegulatoryPage | High | Planned | Preserve feed/source behavior; migrate display primitives only. |
| QuotePage | High | Planned | Quotation/invoice workflow; preserve all IDs and calculation events. |
| DataImportPage | Medium | Planned | Normalize upload/drop zone/progress/errors; retain parsers. |
| QrBarcodePage | Medium | Planned | Normalize scanner/output cards; verify camera permission on iOS/WebKit. |
| InventoryScannerPage | Medium | Planned | Verify camera lifecycle and PWA safe-area behavior before visual cleanup. |
| DeliveryMapPage | Medium | Planned | Verify geolocation permissions and map sizing first. |
| MobilePreviewPage | Low | Planned | Align preview with canonical device/responsive tokens. |
| ModuleCatalogPage | Low | Planned | Canonical catalog grid/cards/search. |
| BrandGuidelinesPage | Low | Planned | Replace legacy font examples with canonical Inter/system-mono policy. |
| CommunicationTemplatesPage | Medium | Planned | Normalize editor/list/actions; retain template data contracts. |
| AiAssistantPage | Medium | Planned | Keep server-only secrets; normalize conversation/tool surfaces. |
| BackendPage | Low | Planned | Canonical status/diagnostic cards and code typography. |
| AuditPage | Medium | Planned | Canonical immutable event table and filters. |
| LicensesPage | High | Planned | Preserve licensing/device controls and security semantics. |
| SettingsPage | High | Planned | Theme/accessibility/preferences migration after core screens stabilize. |
| ProfilePage | Medium | Planned | Normalize account/profile sections without altering session behavior. |
| AdminPanelPage | High | Planned | Preserve RBAC/tenant/security controls; migrate in small sub-sections. |
| DemoControlPage | Medium | Planned | Preserve demo access controls. |
| PretestingDashboardPage | Medium | Planned | Normalize QA status matrices/cards. |
| HealthcarePage | High | Planned | Vertical-domain workflows; migrate after shared CRUD/accounting primitives stabilize. |
| VeterinaryClinicPage | High | Planned | Vertical-domain workflow characterization first. |
| GymManagementPage | High | Planned | Vertical-domain workflow characterization first. |
| FastFoodPosPage | High | Planned | POS touch flow must retain speed and transaction semantics. |
| FoodOrdersPage | High | Planned | Preserve order state machine. |
| LoginPage | Critical | **Deferred / no redesign** | Existing auth is retained. Only security/accessibility fixes after dedicated auth characterization tests. |

## Batch order

### Batch 1 — low-risk reference/support screens
Completed: Business Rules, Accounting Standards, Module Maturity, Help, Support CTA.

### Batch 2 — CRUD/reference operations
In progress: History, Clients, Suppliers. Next: Dashboard, Tasks, Inventory, Reports, Analytics, Purchases, Sales, Order Tracking and Banking.

### Batch 3 — accounting/fiscal core
Chart of Accounts, Ledger, General Ledger, Trial Balance, Worksheet, Financial Statements, Accounting Close, Sales Book, Taxes and Regulatory. These require characterization/regression checks before changing markup.

### Batch 4 — device/PWA and vertical modules
QR/barcode, inventory scanner, delivery map, mobile preview, healthcare, veterinary, gym, POS and food orders. Camera/geolocation/iOS behavior must be tested alongside the visual migration.

### Batch 5 — administration/security/settings
Licenses, Audit, Admin Panel, Profile, Settings, Demo Control and pretesting. Authentication remains a separate final stream and is not replaced.

## Definition of done per module

A module can move to **Migrated** only when:

- production build succeeds;
- its existing event IDs/data attributes still exist;
- no document-level horizontal overflow is introduced;
- phone/tablet/desktop layout uses the canonical primitives/tokens;
- user-controlled/external strings are escaped before HTML interpolation;
- no server-only secret is referenced by frontend code;
- destructive actions remain visually and semantically distinct;
- automated browser coverage exists when the module has device-specific behavior;
- CSP telemetry is not worsened by new inline styles/scripts.
