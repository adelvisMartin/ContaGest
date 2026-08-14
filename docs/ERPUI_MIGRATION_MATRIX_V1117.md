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
10. Financial/fiscal modules require characterization tests before markup migration.

## Completed foundation

- canonical typography tokens and weights;
- global five-language i18n infrastructure (`es`, `en`, `zh`, `hi`, `ar`) with RTL support;
- locale-aware date, number and currency formatting;
- client-facing copy normalization that removes internal demo/test terminology;
- contextual palettes and RBAC-focused navigation for clinic, veterinary, seller/commerce and gym verticals;
- iOS safe-area and touch/input baseline;
- reusable `ErpStack`, `ErpRow`, `ErpGrid`, `ErpCard`, `ErpSection`, `ErpButton`, `ErpField`, `ErpBadge`, `ErpEmptyState`, `ErpDataTable`;
- accessible icon-only actions and destructive button state;
- canonical PWA install surface without runtime style injection or `innerHTML`;
- WebKit desktop/iPhone Playwright projects;
- CSP Report-Only collector and dedicated limiter;
- security CI baseline for secrets, validation, rate limits, CSP telemetry and PWA DOM sinks;
- managed-auth benchmark document while retaining ContaGest authentication;
- financial characterization tests covering quote taxes/retentions, ledger equality, payroll formula, inventory valuation and weighted-average kardex.

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
| DashboardPage | Medium | **Migrated** | Real-state KPI hierarchy and CSP-safe monthly flow; invented fallback totals removed. |
| AnalyticsPage | Medium | **Migrated** | Canonical sections/table; CSP-safe progress bars; analytics contracts preserved. |
| ReportsPage | Medium | **Migrated** | Canonical filters/KPIs/table/export; values derived from real state. |
| TasksPage | Medium | **Migrated** | Canonical form/list/board/actions; task service contracts preserved. |
| InventoryPage | Medium | **Migrated** | Canonical form/table/KPIs; synchronization copy normalized. |
| KardexPage | Medium | **Migrated** | Canonical financial table, locale-aware timestamps and numeric alignment. |
| PurchasesPage | Medium | **Migrated** | Purchase creation, draft deletion and accounting reversal actions preserved. |
| SalesPage | Medium | **Migrated** | Sales/create/sync/quote/delete behavior preserved with seller workspace context. |
| OrderTrackingPage | Medium | Planned | Normalize status timeline/cards. |
| BankingPage | Medium | **Migrated** | Accounts/movements/import/export/reconciliation preserved on canonical sections/table. |
| PayrollPage | High | **Migrated + characterized** | Existing payroll formula covered before markup migration; employee/receipt/period actions preserved. |
| HrDashboardPage | Medium | Planned | Normalize HR KPIs/cards after payroll detail screen. |
| ChartAccountsPage | High | Characterization ready | Preserve accounting hierarchy and plan-of-accounts interactions. |
| LedgerPage | High | Characterization ready | Double-entry tolerance and reversal policy locked before migration. |
| GeneralLedgerPage | High | Characterization ready | Preserve debit/credit totals and report semantics. |
| TrialBalancePage | High | Characterization ready | Preserve accounting equality and numeric precision. |
| WorksheetPage | High | Characterization ready | Preserve worksheet calculations and export behavior. |
| FinancialStatementsPage | High | Characterization ready | Preserve statement grouping/totals and reporting semantics. |
| AccountingClosePage | High | Characterization ready | Close-period flow still needs route-specific regression before markup change. |
| SalesBookPage | High | Characterization ready | Quote/fiscal calculation baseline exists; route-specific tax-book tests next. |
| TaxesPage | High | Characterization ready | Quote tax/retention calculations locked; UI migration next. |
| RegulatoryPage | High | Planned | Preserve feed/source behavior; migrate display primitives only. |
| QuotePage | High | **Characterized / UI pending** | Taxes and retentions baseline locked; preserve all form IDs/calculation events during migration. |
| DataImportPage | Medium | Planned | Normalize upload/drop zone/progress/errors; retain parsers. |
| QrBarcodePage | Medium | Planned | Normalize scanner/output cards; verify camera permission on iOS/WebKit. |
| InventoryScannerPage | Medium | Planned | Verify camera lifecycle and PWA safe-area behavior before visual cleanup. |
| DeliveryMapPage | Medium | Planned | Verify geolocation permissions and map sizing first. |
| MobilePreviewPage | Low | Planned | Align preview with canonical device/responsive tokens. |
| ModuleCatalogPage | Low | Planned | Canonical catalog grid/cards/search and customer copy. |
| BrandGuidelinesPage | Low | Planned | Replace remaining legacy font examples with canonical Inter/system-mono policy. |
| CommunicationTemplatesPage | Medium | Planned | Normalize editor/list/actions; retain template data contracts. |
| AiAssistantPage | Medium | Planned | Keep server-only secrets; normalize conversation/tool surfaces. |
| BackendPage | Low | Planned | Canonical status/diagnostic cards and code typography. |
| AuditPage | Medium | Planned | Canonical immutable event table and filters. |
| LicensesPage | High | Planned | Preserve licensing/device controls and security semantics. |
| SettingsPage | High | **Migrated foundation** | Five languages, binary theme and client-facing copy done; deeper integration/security panels remain. |
| ProfilePage | Medium | Planned | Normalize account/profile sections without altering session behavior. |
| AdminPanelPage | High | Planned | Preserve RBAC/tenant/security controls; migrate in small sub-sections. |
| DemoControlPage | Medium | Copy normalized | Internal identifiers retained; customer-facing copy changed to commercial access terminology. |
| PretestingDashboardPage | Medium | Copy normalized | Visible naming becomes “Estado del sistema”; deeper ERPUI migration pending. |
| HealthcarePage | High | Vertical context ready | Clinical palette/RBAC/access priority implemented; workflow-specific ERPUI migration pending. |
| VeterinaryClinicPage | High | Vertical context ready | Veterinary palette + MUI typography/RBAC implemented; workflow characterization pending. |
| GymManagementPage | High | Vertical context ready | Fitness palette/RBAC/access priority implemented; workflow characterization pending. |
| FastFoodPosPage | High | Planned | POS touch flow must retain speed and transaction semantics. |
| FoodOrdersPage | High | Planned | Preserve order state machine. |
| LoginPage | Critical | **Deferred / no redesign** | Existing auth is retained. Only security/accessibility fixes after dedicated auth characterization tests. |

## Batch order

### Batch 1 — reference/support screens
Completed: Business Rules, Accounting Standards, Module Maturity, Help and Support CTA.

### Batch 2 — operational/CRUD screens
Completed or materially migrated: History, Clients, Suppliers, Dashboard, Tasks, Inventory, Reports, Analytics, Purchases, Sales, Banking, Kardex and Payroll. Remaining: Order Tracking and related POS/order flows.

### Batch 3 — accounting/fiscal core
Characterization baseline is now active. Next markup migrations: Chart of Accounts, Ledger, General Ledger, Trial Balance, Worksheet, Financial Statements, Accounting Close, Sales Book, Taxes, Regulatory and Quote. These will be changed only behind regression invariants.

### Batch 4 — device/PWA and vertical modules
QR/barcode, inventory scanner, delivery map, mobile preview, healthcare, veterinary, gym, POS and food orders. Camera/geolocation/iOS behavior must be tested alongside the visual migration.

### Batch 5 — administration/security/settings
Licenses, Audit, Admin Panel, Profile, deeper Settings, Commercial Access and System Status. Authentication remains a separate final stream and is not replaced.

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
- CSP telemetry is not worsened by new inline styles/scripts;
- financial/fiscal modules pass their characterization invariants before and after migration.
