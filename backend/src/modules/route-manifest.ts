import type { Router } from 'express';
import { createLazyCrudRouter } from './crud.factory.js';
import { clientSchema, supplierSchema, productSchema, bankAccountSchema, taxPeriodSchema } from './schemas.js';
import tenantRoutes from './tenants/tenants.routes.js';
import licenseDeviceRoutes from './license-devices/license-devices.routes.js';
import commercialAccessRoutes from './commercial-access/commercial-access.routes.js';
import salesRoutes from './sales/sales.routes.js';
import purchasesRoutes from './purchases/purchases.routes.js';
import payablesRoutes from './payables/payables.routes.js';
import approvalsRoutes from './approvals/approvals.routes.js';
import accountingRoutes from './accounting/accounting.routes.js';
import reportsRoutes from './reports/reports.routes.js';
import moduleRoutes from './modules/modules.routes.js';
import currencyRoutes from './currency/currency.routes.js';
import exportRoutes from './exports/exports.routes.js';
import chartAccountRoutes from './chart-accounts/chart-accounts.routes.js';
import hrRoutes from './hr/hr.routes.js';
import bankingRoutes from './banking/banking.routes.js';
import bankReconciliationRoutes from './bank-reconciliation/bank-reconciliation.routes.js';
import inventoryRoutes from './inventory/inventory.routes.js';
import payrollRoutes from './payroll/payroll.routes.js';
import tasksRoutes from './tasks/tasks.routes.js';
import employeesRoutes from './employees/employees.routes.js';
import fiscalRoutes from './fiscal/fiscal.routes.js';
import analyticsRoutes from './analytics/analytics.routes.js';
import qrRoutes from './qr/qr.routes.js';
import foodRoutes from './food/food.routes.js';
import notificationRoutes from './notifications/notifications.routes.js';
import mapsRoutes from './maps/maps.routes.js';
import aiRoutes from './ai/ai.routes.js';
import demosRoutes from './demos/demos.routes.js';
import pretestingRoutes from './pretesting/pretesting.routes.js';
import licenseRoutes from './licenses/licenses.routes.js';
import serviceRestrictionRoutes from './commercial/service-restrictions.routes.js';
import commercialRoutes from './commercial/commercial.routes.js';
import importRoutes from './imports/imports.routes.js';
import regulatoryRoutes from './regulatory/regulatory.routes.js';
import rulesRoutes from './rules/rules.routes.js';
import rbacRoutes from './rbac/rbac.routes.js';
import userSecurityRoutes from './user-security/user-security.routes.js';
import verticalRoutes from './verticals/verticals.routes.js';
import verticalExtendedRoutes from './verticals/verticals-extended.routes.js';
import veterinaryRoutes from './verticals/veterinary.routes.js';
import veterinaryCrudRoutes from './verticals/veterinary-crud.routes.js';
import mediaRoutes from './media/media.routes.js';

export type ArchitectureDomain = 'platform' | 'financial' | 'commercial' | 'operations' | 'vertical';

type RouteManifestEntry = Readonly<{
  id: string;
  domain: ArchitectureDomain;
  path: string;
  router: Router;
}>;

export const MODULE_ROUTE_MANIFEST: readonly RouteManifestEntry[] = Object.freeze([
  { id: 'tenants', domain: 'platform', path: '/tenants', router: tenantRoutes },
  { id: 'clients', domain: 'commercial', path: '/clients', router: createLazyCrudRouter({ model:'client' as any, entity:'client', permission:'clients.manage', schema:clientSchema, searchFields:['name','rif'] }) },
  { id: 'suppliers', domain: 'commercial', path: '/suppliers', router: createLazyCrudRouter({ model:'supplier' as any, entity:'supplier', permission:'purchases.manage', schema:supplierSchema, searchFields:['name','rif'] }) },
  { id: 'products', domain: 'operations', path: '/products', router: createLazyCrudRouter({ model:'product' as any, entity:'product', permission:'inventory.manage', schema:productSchema, searchFields:['name','sku'] }) },
  { id: 'bank-accounts', domain: 'financial', path: '/bank-accounts', router: createLazyCrudRouter({ model:'bankAccount' as any, entity:'bankAccount', permission:'banking.manage', schema:bankAccountSchema, searchFields:['bankName','accountNo'] }) },
  { id: 'employees', domain: 'operations', path: '/employees', router: employeesRoutes },
  { id: 'tax-periods', domain: 'financial', path: '/tax-periods', router: createLazyCrudRouter({ model:'taxPeriod' as any, entity:'taxPeriod', permission:'taxes.export', schema:taxPeriodSchema, searchFields:['period'] }) },
  { id: 'sales', domain: 'commercial', path: '/sales', router: salesRoutes },
  { id: 'purchases', domain: 'commercial', path: '/purchases', router: purchasesRoutes },
  { id: 'payables', domain: 'financial', path: '/payables', router: payablesRoutes },
  { id: 'approvals', domain: 'platform', path: '/approvals', router: approvalsRoutes },
  { id: 'accounting', domain: 'financial', path: '/accounting', router: accountingRoutes },
  { id: 'reports', domain: 'financial', path: '/reports', router: reportsRoutes },
  { id: 'modules', domain: 'platform', path: '/modules', router: moduleRoutes },
  { id: 'currency', domain: 'financial', path: '/currency', router: currencyRoutes },
  { id: 'exports', domain: 'platform', path: '/exports', router: exportRoutes },
  { id: 'chart-accounts', domain: 'financial', path: '/chart-accounts', router: chartAccountRoutes },
  { id: 'hr', domain: 'operations', path: '/hr', router: hrRoutes },
  { id: 'banking', domain: 'financial', path: '/banking', router: bankingRoutes },
  { id: 'bank-reconciliation', domain: 'financial', path: '/bank-reconciliation', router: bankReconciliationRoutes },
  { id: 'inventory', domain: 'operations', path: '/inventory', router: inventoryRoutes },
  { id: 'payroll', domain: 'financial', path: '/payroll', router: payrollRoutes },
  { id: 'tasks', domain: 'operations', path: '/tasks', router: tasksRoutes },
  { id: 'fiscal', domain: 'financial', path: '/fiscal', router: fiscalRoutes },
  { id: 'analytics', domain: 'platform', path: '/analytics', router: analyticsRoutes },
  { id: 'qr', domain: 'operations', path: '/qr', router: qrRoutes },
  { id: 'food', domain: 'vertical', path: '/food', router: foodRoutes },
  { id: 'notifications', domain: 'platform', path: '/notifications', router: notificationRoutes },
  { id: 'maps', domain: 'operations', path: '/maps', router: mapsRoutes },
  { id: 'ai', domain: 'platform', path: '/ai', router: aiRoutes },
  { id: 'demos', domain: 'platform', path: '/demos', router: demosRoutes },
  { id: 'pretesting', domain: 'platform', path: '/pretesting', router: pretestingRoutes },
  { id: 'licenses', domain: 'platform', path: '/licenses', router: licenseRoutes },
  { id: 'license-devices', domain: 'platform', path: '/license-devices', router: licenseDeviceRoutes },
  { id: 'service-restrictions', domain: 'commercial', path: '/commercial', router: serviceRestrictionRoutes },
  { id: 'commercial', domain: 'commercial', path: '/commercial', router: commercialRoutes },
  { id: 'commercial-access', domain: 'commercial', path: '/commercial-access', router: commercialAccessRoutes },
  { id: 'imports', domain: 'operations', path: '/imports', router: importRoutes },
  { id: 'regulatory', domain: 'financial', path: '/regulatory', router: regulatoryRoutes },
  { id: 'rules', domain: 'platform', path: '/rules', router: rulesRoutes },
  { id: 'rbac', domain: 'platform', path: '/rbac', router: rbacRoutes },
  { id: 'user-security', domain: 'platform', path: '/user-security', router: userSecurityRoutes },
  { id: 'vertical-core', domain: 'vertical', path: '/verticals', router: verticalRoutes },
  { id: 'veterinary-crud', domain: 'vertical', path: '/verticals', router: veterinaryCrudRoutes },
  { id: 'vertical-extended', domain: 'vertical', path: '/verticals', router: verticalExtendedRoutes },
  { id: 'veterinary', domain: 'vertical', path: '/verticals/veterinary', router: veterinaryRoutes },
  { id: 'media', domain: 'platform', path: '/media', router: mediaRoutes }
]);

export function mountModuleRouteManifest(router: Router): void {
  for (const entry of MODULE_ROUTE_MANIFEST) router.use(entry.path, entry.router);
}
