import { previewReorderPolicy } from './reorder-policy-preview.js';

export type ReorderPolicyWrite = Readonly<{
  expectedRevision: number;
  enabled: boolean;
  reorderPointExact: string;
  targetStockExact: string;
  safetyStockExact: string;
  orderMultipleExact: string;
  leadTimeDays: string;
}>;

/**
 * Validates policy invariants using the existing exact BigInt calculation.
 * The zero balances here validate assumptions ONLY; persisted previews always
 * use a fresh tenant-scoped Product snapshot from the database.
 */
export function normalizeReorderPolicyWrite(input: ReorderPolicyWrite) {
  const fields = ['expectedRevision','enabled','reorderPointExact','targetStockExact',
    'safetyStockExact','orderMultipleExact','leadTimeDays'] as const;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Reflect.ownKeys(input).length !== fields.length ||
      Reflect.ownKeys(input).some(key=>typeof key !== 'string' || !fields.includes(key as typeof fields[number]))) {
    throw new TypeError('REORDER_POLICY_WRITE_INVALID');
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (fields.some(key=>!Object.hasOwn(descriptors,key) || !Object.hasOwn(descriptors[key],'value'))) {
    throw new TypeError('REORDER_POLICY_WRITE_INVALID');
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
      input.expectedRevision > 2_147_483_645 ||
      typeof input.enabled !== 'boolean' ||
      ![input.reorderPointExact,input.targetStockExact,input.safetyStockExact,
        input.orderMultipleExact,input.leadTimeDays].every(value=>typeof value === 'string')) {
    throw new TypeError('REORDER_POLICY_WRITE_INVALID');
  }
  const preview = previewReorderPolicy({
    stockExact: '0', reservedExact: '0', canonicalMinStockExact: '0',
    reorderPointExact: input.reorderPointExact,
    targetStockExact: input.targetStockExact,
    safetyStockExact: input.safetyStockExact,
    orderMultipleExact: input.orderMultipleExact,
    leadTimeDays: input.leadTimeDays
  });
  return Object.freeze({
    enabled: input.enabled,
    expectedRevision: input.expectedRevision,
    ...preview.assumedPolicy,
    // Immutable policies cannot authorize downstream purchases on their own.
    approvalRequired: true as const,
    autoPurchaseEnabled: false as const
  });
}
