import { prisma } from '../../database/prisma.js';

export async function buildTenantExitPreflight(tenantId: string) {
  const [
    auditLogs,
    ledgerEntries,
    fiscalDocuments,
    clients,
    suppliers,
    products,
    users,
    activeLegalHolds
  ] = await Promise.all([
    prisma.auditLog.count({ where: { tenantId } }),
    prisma.ledgerEntry.count({ where: { tenantId } }),
    prisma.fiscalDocument.count({ where: { tenantId } }),
    prisma.client.count({ where: { tenantId } }),
    prisma.supplier.count({ where: { tenantId } }),
    prisma.product.count({ where: { tenantId } }),
    prisma.userProfile.count({ where: { tenantId } }),
    prisma.moduleRecord.count({ where: { tenantId, moduleSlug: 'data-lifecycle-hold', status: 'active' } })
  ]);

  const immutableEvidence = {
    auditLogs,
    ledgerEntries,
    fiscalDocuments
  };
  const exportInventory = {
    clients,
    suppliers,
    products,
    users
  };
  const immutableCount = Object.values(immutableEvidence).reduce((total, value) => total + value, 0);

  return {
    tenantId,
    exportRequired: true,
    hardDeleteAllowed: immutableCount === 0 && activeLegalHolds === 0,
    blockers: {
      activeLegalHolds,
      immutableEvidence: immutableCount
    },
    immutableEvidence,
    exportInventory,
    nextStep: activeLegalHolds > 0
      ? 'release-or-resolve-legal-holds'
      : immutableCount > 0
        ? 'export-and-retain-immutable-evidence-per-approved-policy'
        : 'request-explicit-tenant-termination-authorization'
  };
}
