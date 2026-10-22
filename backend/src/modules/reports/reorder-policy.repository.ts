import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { previewReorderPolicy } from './reorder-policy-preview.js';
import { normalizeReorderPolicyWrite, type ReorderPolicyWrite } from './reorder-policy-write.js';

type PolicyRow = {
  tenantId: string; productId: string; enabled: boolean;
  reorderPoint: Prisma.Decimal; targetStock: Prisma.Decimal;
  safetyStock: Prisma.Decimal; orderMultiple: Prisma.Decimal;
  leadTimeDays: number; revision: number; updatedBy: string | null;
  createdAt: Date; updatedAt: Date;
};

const productSelect = {
  id: true, sku: true, name: true, unit: true, stock: true,
  reserved: true, minStock: true
} as const;

export function serializeReorderPolicy(row: PolicyRow) {
  return {
    productId: row.productId, enabled: row.enabled, revision: row.revision,
    reorderPointExact: row.reorderPoint.toFixed(3),
    targetStockExact: row.targetStock.toFixed(3),
    safetyStockExact: row.safetyStock.toFixed(3),
    orderMultipleExact: row.orderMultiple.toFixed(3),
    leadTimeDays: row.leadTimeDays,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function previewForProduct(product: {
  stock: Prisma.Decimal; reserved: Prisma.Decimal; minStock: Prisma.Decimal;
}, policy: PolicyRow) {
  try {
    const preview = previewReorderPolicy({
      stockExact: product.stock, reservedExact: product.reserved,
      canonicalMinStockExact: product.minStock,
      reorderPointExact: policy.reorderPoint,
      targetStockExact: policy.targetStock,
      safetyStockExact: policy.safetyStock,
      orderMultipleExact: policy.orderMultiple,
      leadTimeDays: String(policy.leadTimeDays)
    });
    // A saved plan is not authority for a purchase or GL effect.
    return {
      ...preview, mode: 'PERSISTED_POLICY_REVIEW_ONLY' as const,
      policyPersistence: 'STORED' as const,
      policyRevision: policy.revision,
      enabled: policy.enabled
    };
  } catch (error) {
    if (error instanceof TypeError) {
      throw new HttpError(409, 'La política o los saldos de inventario requieren conciliación.', {
        code: 'REORDER_POLICY_STORED_STOCK_CONFLICT'
      });
    }
    throw error;
  }
}

export async function getPersistedReorderPolicy(input: {
  tenantId: string; productId: string
}) {
  return prisma.$transaction(async tx => {
    const product = await tx.product.findFirst({
      where: { tenantId: input.tenantId, id: input.productId, active: true },
      select: productSelect
    });
    if (!product) throw new HttpError(404, 'Producto activo no encontrado.', {code:'REORDER_POLICY_PRODUCT_NOT_FOUND'});
    const policy = await tx.inventoryReorderPolicy.findUnique({
      where: { tenantId_productId: { tenantId: input.tenantId, productId: input.productId } }
    });
    return {
      product: {id: product.id, sku: product.sku, name: product.name, unit: product.unit},
      policy: policy ? serializeReorderPolicy(policy) : null,
      review: policy?.enabled ? previewForProduct(product, policy) : null,
      manualApprovalRequired: true,
      autoPurchaseEnabled: false,
      sourceOfStock: 'Product.stock/reserved'
    };
  }, {isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead});
}

export async function savePersistedReorderPolicy(input: {
  tenantId: string; productId: string; userId: string;
  policy: ReorderPolicyWrite
}) {
  let normalized: ReturnType<typeof normalizeReorderPolicyWrite>;
  try { normalized = normalizeReorderPolicyWrite(input.policy); }
  catch (error) {
    if (error instanceof TypeError) {
      throw new HttpError(422, 'Política de reposición inválida.', {code:error.message});
    }
    throw error;
  }
  const values = {
    enabled: normalized.enabled,
    reorderPoint: normalized.reorderPointExact,
    targetStock: normalized.targetStockExact,
    safetyStock: normalized.safetyStockExact,
    orderMultiple: normalized.orderMultipleExact,
    leadTimeDays: normalized.leadTimeDays,
    updatedBy: input.userId
  };
  try {
    return await prisma.$transaction(async tx => {
      const product = await tx.product.findFirst({
        where: {tenantId:input.tenantId,id:input.productId,active:true},
        select: productSelect
      });
      if (!product) throw new HttpError(404, 'Producto activo no encontrado.', {code:'REORDER_POLICY_PRODUCT_NOT_FOUND'});
      // Validate the current stock/reservation relationship before saving policy.
      previewReorderPolicy({
        stockExact:product.stock,reservedExact:product.reserved,
        canonicalMinStockExact:product.minStock,
        reorderPointExact:values.reorderPoint,targetStockExact:values.targetStock,
        safetyStockExact:values.safetyStock,orderMultipleExact:values.orderMultiple,
        leadTimeDays:String(values.leadTimeDays)
      });
      let before: PolicyRow | null = null;
      if (normalized.expectedRevision === 0) {
        // A unique tenant/product DB key is the concurrent create arbiter.
        await tx.inventoryReorderPolicy.create({
          data:{tenantId:input.tenantId,productId:input.productId,...values}
        });
      } else {
        before = await tx.inventoryReorderPolicy.findUnique({
          where:{tenantId_productId:{tenantId:input.tenantId,productId:input.productId}}
        });
        const result = await tx.inventoryReorderPolicy.updateMany({
          where:{
            tenantId:input.tenantId,productId:input.productId,
            revision:normalized.expectedRevision
          },
          data:{...values,revision:{increment:1}}
        });
        if (result.count !== 1) {
          throw new HttpError(409,'La política fue actualizada por otra solicitud.',{
            code:'REORDER_POLICY_STALE_REVISION'
          });
        }
      }
      const saved = await tx.inventoryReorderPolicy.findUniqueOrThrow({
        where:{tenantId_productId:{tenantId:input.tenantId,productId:input.productId}}
      });
      const view = serializeReorderPolicy(saved);
      await tx.auditLog.create({data:{
        tenantId:input.tenantId,userId:input.userId,
        action:'inventory.reorder-policy.saved',entity:'InventoryReorderPolicy',
        entityId:input.productId,
        before:before ? serializeReorderPolicy(before) as Prisma.InputJsonValue : undefined,
        after:view as Prisma.InputJsonValue
      }});
      return {
        policy:view,
        review:saved.enabled ? previewForProduct(product,saved) : null,
        sourceOfStock:'Product.stock/reserved' as const,
        manualApprovalRequired:true as const,autoPurchaseEnabled:false as const
      };
    }, {isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  } catch(error) {
    if (error instanceof TypeError) {
      throw new HttpError(409, 'El inventario no permite configurar reposición confiable.', {
        code: 'REORDER_POLICY_STOCK_CONFLICT'
      });
    }
    if(error instanceof Prisma.PrismaClientKnownRequestError &&
       (error.code==='P2002' || error.code==='P2034')) {
      throw new HttpError(409,'Colisión concurrente de configuración; vuelve a leer la revisión.',{
        code:'REORDER_POLICY_CONCURRENT_CHANGE'
      });
    }
    throw error;
  }
}
