/**
 * Read-only outbound inactivity, not sales velocity, inventory turnover or
 * lot/location availability. Caller MUST verify complete ledger reconciliation.
 */
export const STOCK_MOVEMENT_ACTIVITY_VERSION = 'physical-outbound-inactivity-v1';
export type PhysicalOutboundMovement = Readonly<{
  id: string;
  type: 'in' | 'out' | 'adjustment' | 'reservation' | 'release';
  quantity: string | { toString(): string };
  createdAt: Date;
}>;

function exactUnits(quantity: string | { toString(): string }): bigint {
  const s = quantity.toString();
  if (!/^\d{1,15}(?:\.\d{1,3})?$/.test(s)) throw new TypeError('OUTBOUND_QUANTITY_INVALID');
  const [integer, fraction = ''] = s.split('.');
  return BigInt(integer) * 1000n + BigInt(fraction.padEnd(3, '0'));
}

function exactText(units: bigint): string {
  return String(units / 1000n) + '.' + String(units % 1000n).padStart(3, '0');
}

export function summarizePhysicalOutbound(input: {
  movements: readonly PhysicalOutboundMovement[];
  stockExact: string;
  asOf: Date;
  inactivityDays: number;
  reconciled: true;
}) {
  const snapshot = input.asOf.getTime();
  if (!Number.isFinite(snapshot) || !Number.isInteger(input.inactivityDays) ||
      input.inactivityDays < 1 || input.inactivityDays > 3650 || input.reconciled !== true) {
    throw new TypeError('OUTBOUND_ACTIVITY_INPUT_INVALID');
  }
  const onHand = exactUnits(input.stockExact);
  const cutOff = snapshot - input.inactivityDays * 86_400_000;
  let latestOutbound: Date | null = null;
  let outboundCountWindow = 0;
  let outboundQuantityWindow = 0n;
  for (const movement of input.movements) {
    if (!movement.id || !(movement.createdAt instanceof Date) ||
        !Number.isFinite(movement.createdAt.getTime()) || movement.createdAt.getTime() > snapshot) {
      throw new TypeError('OUTBOUND_MOVEMENT_INVALID');
    }
    if (movement.type !== 'out') continue;
    const quantity = exactUnits(movement.quantity);
    if (quantity <= 0n) throw new TypeError('OUTBOUND_QUANTITY_INVALID');
    if (!latestOutbound || movement.createdAt > latestOutbound) latestOutbound = movement.createdAt;
    if (movement.createdAt.getTime() >= cutOff) {
      outboundCountWindow += 1;
      outboundQuantityWindow += quantity;
    }
  }
  // No outbound activity is not proof of low demand: zero available stock,
  // missing sales or newly received inventory can explain the absence.
  const status = onHand === 0n ? 'out_of_stock' : !latestOutbound ? 'no_outbound_recorded' :
    outboundCountWindow === 0 ? 'outbound_inactive' : 'recent_outbound';
  return {
    version: STOCK_MOVEMENT_ACTIVITY_VERSION,
    authority: 'InventoryMovement.type=out',
    interpretation: 'PHYSICAL_OUTBOUND_ONLY_NOT_SALES_OR_DEMAND',
    status,
    stockExact: exactText(onHand),
    inactivityDays: input.inactivityDays,
    asOf: input.asOf.toISOString(),
    lastOutboundAt: latestOutbound?.toISOString() ?? null,
    outboundCountWindow,
    outboundQuantityWindowExact: exactText(outboundQuantityWindow),
    reconciliationRequired: true,
    noAutomaticProcurement: true
  };
}
