import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();

const ADMIN_RIF = '00000000';
const ADMIN_EMAIL = 'admin@erp.local';
const ADMIN_PASSWORD = 'Adm1n$2026';

async function seedPermissions() {
  const permissions = [
    ['dashboard.read', 'Ver dashboard'],
    ['clients.manage', 'Gestionar clientes'],
    ['sales.manage', 'Gestionar ventas'],
    ['sales.view', 'Ver ventas'],
    ['purchases.manage', 'Gestionar compras'],
    ['inventory.manage', 'Gestionar inventario'],
    ['accounting.post', 'Postear asientos'],
    ['accounting.view', 'Ver contabilidad'],
    ['banking.manage', 'Gestionar bancos y conciliación'],
    ['taxes.export', 'Exportar libros fiscales'],
    ['payroll.manage', 'Gestionar nómina'],
    ['reports.view', 'Ver reportes'],
    ['modules.manage', 'Gestionar módulos'],
    ['audit.read', 'Ver auditoría'],
    ['admin.manage', 'Administración global']
  ];
  for (const [key, description] of permissions) {
    await prisma.permission.upsert({ where: { key }, update: { description }, create: { key, description } });
  }
}

async function seedChartAccounts(tenantId: string) {
  const chartPath = path.resolve(process.cwd(), 'data/chart_accounts.json');
  if (!fs.existsSync(chartPath)) return;
  const chartAccounts = JSON.parse(fs.readFileSync(chartPath, 'utf8'));
  for (const account of chartAccounts) {
    await prisma.chartAccount.upsert({
      where: { tenantId_code: { tenantId, code: account.code } },
      update: { ...account },
      create: { tenantId, ...account }
    });
  }
}

async function ensureRoleAndUser(tenantId: string) {
  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId, name: 'Administrador Global' } },
    update: { system: true, description: 'Acceso completo a módulos, demos, monitoreo y configuración.' },
    create: { tenantId, name: 'Administrador Global', system: true, description: 'Acceso completo a módulos, demos, monitoreo y configuración.' }
  });

  const allPerms = await prisma.permission.findMany();
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      update: {},
      create: { roleId: role.id, permissionId: perm.id }
    });
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const user = await prisma.userProfile.upsert({
    where: { tenantId_email: { tenantId, email: ADMIN_EMAIL } },
    update: { fullName: 'Administrador Local', passwordHash, status: 'active' },
    create: { tenantId, email: ADMIN_EMAIL, fullName: 'Administrador Local', passwordHash, status: 'active' }
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id }
  });

  // Compatibilidad con credenciales antiguas de pruebas internas.
  const legacy = await prisma.userProfile.upsert({
    where: { tenantId_email: { tenantId, email: 'admin@empresa.com' } },
    update: { fullName: 'Administrador Demo', passwordHash: await bcrypt.hash('demo1234', 12), status: 'active' },
    create: { tenantId, email: 'admin@empresa.com', fullName: 'Administrador Demo', passwordHash: await bcrypt.hash('demo1234', 12), status: 'active' }
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: legacy.id, roleId: role.id } },
    update: {},
    create: { userId: legacy.id, roleId: role.id }
  });
}

async function seedOperationalData(tenantId: string) {
  const client = await prisma.client.upsert({
    where: { tenantId_rif: { tenantId, rif: 'J-31415926-5' } },
    update: { name: 'Cliente Corporativo Demo', contact: 'María Pérez' },
    create: { tenantId, rif: 'J-31415926-5', name: 'Cliente Corporativo Demo', contact: 'María Pérez', email: 'cliente@demo.local' }
  });

  await prisma.supplier.upsert({
    where: { tenantId_rif: { tenantId, rif: 'J-40111222-0' } },
    update: { name: 'Suministros Andinos' },
    create: { tenantId, rif: 'J-40111222-0', name: 'Suministros Andinos', retentionProfile: 'ordinary' }
  });

  const product = await prisma.product.upsert({
    where: { tenantId_sku: { tenantId, sku: 'CG-DEMO-001' } },
    update: { name: 'Producto Demo', cost: 12.5, price: 20, stock: 18, minStock: 5, taxRate: 16 },
    create: { tenantId, sku: 'CG-DEMO-001', name: 'Producto Demo', cost: 12.5, price: 20, stock: 18, minStock: 5, taxRate: 16, barcode: '7591000000001' }
  });

  const sale = await prisma.salesInvoice.upsert({
    where: { tenantId_number: { tenantId, number: 'FAC-2026-001' } },
    update: { subtotal: 20, iva: 3.2, total: 23.2, status: 'issued' },
    create: { tenantId, clientId: client.id, number: 'FAC-2026-001', controlNo: '00-000001', fiscalPeriod: '2026-06', subtotal: 20, iva: 3.2, total: 23.2, status: 'issued', currency: 'USD', exchangeRate: 150 }
  });
  await prisma.salesInvoiceLine.create({ data: { invoiceId: sale.id, productId: product.id, description: 'Producto Demo', quantity: 1, unitPrice: 20, total: 20 } }).catch(() => undefined);

  const hrParams = [
    { code: 'IVSS_EMPLOYEE', name: 'IVSS trabajador', value: 4, unit: 'percent' },
    { code: 'IVSS_EMPLOYER', name: 'IVSS patronal referencial', value: 9, unit: 'percent' },
    { code: 'FAOV_EMPLOYEE', name: 'FAOV trabajador', value: 1, unit: 'percent' },
    { code: 'FAOV_EMPLOYER', name: 'FAOV patronal', value: 2, unit: 'percent' },
    { code: 'INCES_EMPLOYER', name: 'INCES patronal referencial', value: 2, unit: 'percent' }
  ];
  for (const param of hrParams) {
    await prisma.hrParameter.create({ data: { tenantId, ...param, effectiveFrom: new Date('2026-01-01') } }).catch(() => undefined);
  }
}

async function main() {
  if (process.argv.includes('--clean-demo')) {
    await prisma.tenant.deleteMany({ where: { rif: ADMIN_RIF } });
    console.log('Tenant demo eliminado.');
    return;
  }

  await seedPermissions();

  const tenant = await prisma.tenant.upsert({
    where: { rif: ADMIN_RIF },
    update: { name: 'ContaGest Demo Enterprise', legalName: 'ContaGest Demo Enterprise C.A.', plan: 'enterprise', status: 'active' },
    create: {
      rif: ADMIN_RIF,
      name: 'ContaGest Demo Enterprise',
      legalName: 'ContaGest Demo Enterprise C.A.',
      plan: 'enterprise',
      status: 'active',
      settings: {
        defaultCurrency: 'USD',
        secondaryCurrency: 'VES',
        reportCurrencyMode: 'both',
        productionReady: true
      }
    }
  });

  await seedChartAccounts(tenant.id);
  await ensureRoleAndUser(tenant.id);
  await seedOperationalData(tenant.id);

  console.log('Seed completo.');
  console.log(`RIF: ${ADMIN_RIF}`);
  console.log(`Email: ${ADMIN_EMAIL}`);
  console.log(`Contraseña: ${ADMIN_PASSWORD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => prisma.$disconnect());
