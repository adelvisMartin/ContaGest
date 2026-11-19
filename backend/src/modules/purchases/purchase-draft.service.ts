import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { writeAudit } from '../../shared/services/audit.service.js';

export type DeletePurchaseDraftInput = {
  tenantId: string;
  actorId: string;
  purchaseId: string;
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Delete is permitted only for a tenant-owned draft. Lock the invoice before
 * checking state so another command cannot publish it between check/delete.
 * The deletion and its forensic audit are one fail-closed DB transaction.
 * Issued/cancelled invoices keep their existing reversal-only lifecycle.
 */
export async function deletePurchaseDraft(input: DeletePurchaseDraftInput) {
  if (!input.tenantId || !input.actorId) {
    throw new HttpError(401, 'La eliminación de compras requiere una sesión autenticada.');
  }
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM public."PurchaseInvoice"
      WHERE "tenantId" = ${input.tenantId} AND "id" = ${input.purchaseId}
      FOR UPDATE
    `);
    if (!locked.length) throw new HttpError(404, 'Compra no encontrada.');

    const purchase = await tx.purchaseInvoice.findFirst({
      where: { id: input.purchaseId, tenantId: input.tenantId },
      include: { lines: true },
    });
    if (!purchase) throw new HttpError(404, 'Compra no encontrada.');
    if (purchase.status !== 'draft') {
      throw new HttpError(409, 'Solo se eliminan compras en borrador. Las compras emitidas deben anularse.');
    }

    await tx.purchaseInvoice.delete({ where: { id: purchase.id } });
    await writeAudit({
      tenantId: input.tenantId,
      userId: input.actorId,
      action: 'delete-draft',
      entity: 'PurchaseInvoice',
      entityId: purchase.id,
      before: purchase,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    }, tx);
    return { deleted: true, id: purchase.id };
  });
}
