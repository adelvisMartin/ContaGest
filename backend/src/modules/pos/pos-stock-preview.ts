/**
 * Informational POS stock preview only. This snapshot does not reserve stock,
 * lock rows, confirm availability by location/lot, or authorize checkout.
 * Exact Decimal(18,3) arithmetic; no floating-point conversions.
 */
const PRODUCT_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const DECIMAL3 = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,3})?$/;
const MAX_MILLI = 999999999999999999n;
const MAX_LINES = 100;

export type PosStockRequestLine = Readonly<{ productId:string; quantity:string }>;
export type PosStockRow = Readonly<{ id:string; stock:string; reserved:string }>;
export type PosStockPreviewLine = Readonly<{
  productId:string; requested:string; stock:string; reserved:string;
  available:string; shortfall:string; status:'available'|'shortage';
}>;
export type PosStockPreview = Readonly<{
  ready:boolean; readOnly:true; authoritativeForCheckout:false; stockReserved:false; lines:readonly PosStockPreviewLine[];
}>;
export type PosStockPreviewErrorCode =
  | 'INVALID_LINES' | 'INVALID_PRODUCT' | 'DUPLICATE_PRODUCT'
  | 'INVALID_QUANTITY' | 'INVALID_STOCK' | 'MISSING_PRODUCT'
  | 'DUPLICATE_STOCK_ROW' | 'INVALID_DATA';

export class PosStockPreviewError extends Error {
  readonly code:PosStockPreviewErrorCode;
  constructor(code:PosStockPreviewErrorCode) {
    super('POS_STOCK_' + code);
    this.name = 'PosStockPreviewError';
    this.code = code;
  }
}

function id(value:unknown):string {
  if (typeof value !== 'string' || !PRODUCT_ID.test(value)) throw new PosStockPreviewError('INVALID_PRODUCT');
  return value.toLowerCase();
}

function milli(value:unknown, failure:PosStockPreviewErrorCode, positive=false):bigint {
  if (typeof value !== 'string' || !DECIMAL3.test(value)) throw new PosStockPreviewError(failure);
  const [whole, fraction=''] = value.split('.');
  const total = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3,'0') || '0');
  if (total > MAX_MILLI || (positive && total === 0n)) throw new PosStockPreviewError(failure);
  return total;
}

function decimal(value:bigint):string {
  return `${value / 1000n}.${(value % 1000n).toString().padStart(3,'0')}`;
}

/** Validate before querying; this also deduplicates canonical upper/lower-case IDs. */
export function validatePosStockLines(input:unknown):readonly PosStockRequestLine[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_LINES) throw new PosStockPreviewError('INVALID_LINES');
  const seen = new Set<string>();
  return Object.freeze(input.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PosStockPreviewError('INVALID_LINES');
    const line = raw as {productId?:unknown;quantity?:unknown};
    const productId = id(line.productId);
    if (seen.has(productId)) throw new PosStockPreviewError('DUPLICATE_PRODUCT');
    seen.add(productId);
    return Object.freeze({productId,quantity:decimal(milli(line.quantity,'INVALID_QUANTITY',true))});
  }));
}

/** The caller must fetch all rows with tenantId + active:true in the WHERE clause. */
export function previewPosStock(linesInput:unknown, rowsInput:unknown):PosStockPreview {
  const lines = validatePosStockLines(linesInput);
  if (!Array.isArray(rowsInput) || rowsInput.length !== lines.length) throw new PosStockPreviewError('MISSING_PRODUCT');
  const expected = new Set(lines.map(line=>line.productId));
  const rows = new Map<string,{stock:bigint;reserved:bigint}>();
  for (const raw of rowsInput) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PosStockPreviewError('INVALID_DATA');
    const row = raw as {id?:unknown;stock?:unknown;reserved?:unknown};
    const productId = id(row.id);
    if (!expected.has(productId)) throw new PosStockPreviewError('INVALID_DATA');
    if (rows.has(productId)) throw new PosStockPreviewError('DUPLICATE_STOCK_ROW');
    const stock = milli(row.stock,'INVALID_STOCK');
    const reserved = milli(row.reserved,'INVALID_STOCK');
    if (reserved > stock) throw new PosStockPreviewError('INVALID_STOCK');
    rows.set(productId,{stock,reserved});
  }
  if (rows.size !== lines.length) throw new PosStockPreviewError('MISSING_PRODUCT');
  const result = Object.freeze(lines.map((line):PosStockPreviewLine => {
    const row = rows.get(line.productId)!;
    const available = row.stock - row.reserved;
    const requested = milli(line.quantity,'INVALID_QUANTITY',true);
    const shortfall = requested > available ? requested - available : 0n;
    return Object.freeze({
      productId:line.productId,requested:line.quantity,
      stock:decimal(row.stock), reserved:decimal(row.reserved),
      available:decimal(available),shortfall:decimal(shortfall),
      status:shortfall>0n?'shortage':'available'
    });
  }));
  return Object.freeze({ready:result.every(line=>line.status==='available'),readOnly:true as const,
    authoritativeForCheckout:false as const,stockReserved:false as const,lines:result});
}
