import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();

const ADMIN_RIF = '00000000';
const ADMIN_EMAIL = 'admin@erp.local';
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const configuredPassword = String(process.env.SEED_ADMIN_PASSWORD || '').trim();
const ADMIN_PASSWORD = configuredPassword || 'Adm1n$2026';
const seedLegacyDemo = !isProduction && String(process.env.SEED_LEGACY_DEMO || '').toLowerCase() === 'true';

if (isProduction && configuredPassword.length < 12) {
  throw new Error('SEED_ADMIN_PASSWORD es obligatorio en producción y debe tener al menos 12 caracteres.');
}

async function seedPermissions() {
  const permissions = [
    ['dashboard.read', 'Ver dashboard'],
    ['clients.manage', 'Gestionar clientes'],
    ['sales.manage', 'Gestionar ventas'],
    ['sales.view', 'Ver ventas'],
    ['purchases.manage', 'Gestionar compras'],
    ['inventory.manage', 'Gestionar movimientos ordinarios de inventario'],
    ['inventory.adjust', 'Ajustar y reversar inventario con motivo auditable'],
    ['accounting.post', 'Postear asientos'],
    ['accounting.view', 'Ver contabilidad'],
    ['banking.manage', 'Gestionar bancos y conciliación'],
    ['taxes.export', 'Exportar libros fiscales'],
    ['payroll.manage', 'Gestionar nómina'],
    ['reports.view', 'Ver reportes'],
    ['modules.manage', 'Gestionar módulos'],
    ['audit.read', 'Ver auditoría'],
    ['health.manage', 'Gestionar pacientes, historias clínicas y citas'],
    ['gym.manage', 'Gestionar socios, membresías, rutinas y nutrición'],
    ['communications.manage', 'Gestionar mensajes y plantillas operativas'],
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

  if (seedLegacyDemo) {
    const legacyPassword = String(process.env.SEED_LEGACY_DEMO_PASSWORD || '').trim();
    if (legacyPassword.length < 12) throw new Error('SEED_LEGACY_DEMO_PASSWORD debe tener al menos 12 caracteres.');
    const legacy = await prisma.userProfile.upsert({
      where: { tenantId_email: { tenantId, email: 'admin@empresa.com' } },
      update: { fullName: 'Administrador Demo', passwordHash: await bcrypt.hash(legacyPassword, 12), status: 'active' },
      create: { tenantId, email: 'admin@empresa.com', fullName: 'Administrador Demo', passwordHash: await bcrypt.hash(legacyPassword, 12), status: 'active' }
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: legacy.id, roleId: role.id } },
      update: {},
      create: { userId: legacy.id, roleId: role.id }
    });
  }
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
    update: { name: 'Producto Demo', cost: 12.5, price: 20, minStock: 5, taxRate: 16 },
    create: { tenantId, sku: 'CG-DEMO-001', name: 'Producto Demo', cost: 12.5, price: 20, stock: 0, reserved: 0, minStock: 5, taxRate: 16, barcode: '7591000000001' }
  });

  const seedOpening = await prisma.inventoryMovement.findFirst({ where: { tenantId, productId: product.id, source: 'seed-opening' } });
  if (!seedOpening && product.stock.eq(0) && product.reserved.eq(0)) {
    await prisma.$transaction(async (tx) => {
      const movement = await tx.inventoryMovement.create({ data: { tenantId, productId: product.id, type: 'in', quantity: 18, unitCost: 12.5, source: 'seed-opening', sourceId: 'CG-DEMO-001', note: 'Saldo inicial demo creado por seed.' } });
      await tx.product.update({ where: { id: product.id }, data: { stock: { increment: 18 } } });
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "InventoryMovementAuditLink"
          ("id","tenantId","productId","originalMovementId","relatedMovementId","kind","reasonCode","reason","createdBy")
        VALUES
          (CAST(${randomUUID()} AS uuid),${tenantId},${product.id},NULL,${movement.id},'opening','SEED_OPENING','Saldo inicial demo creado por seed.',NULL)
        ON CONFLICT DO NOTHING
      `);
    });
  }

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
  console.log(configuredPassword ? 'Contraseña configurada mediante SEED_ADMIN_PASSWORD.' : 'Contraseña local de desarrollo aplicada; no usar este seed en producción.');
  if (seedLegacyDemo) console.log('Usuario demo heredado creado mediante variables de entorno explícitas.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => prisma.$disconnect());