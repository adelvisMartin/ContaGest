/**
 * Inventory reorder scan pages enumerate the ACTIVE PRODUCT catalog, not only
 * matches. A filtered page with zero matches may have further catalog pages.
 * Do not imply full tenant coverage or a durable cursor between HTTP requests.
 */
export const REORDER_SCAN_DEFAULT_TAKE = 500;
export const REORDER_SCAN_MAX_TAKE = 1000;
export const REORDER_SCAN_MAX_SKIP = 1_000_000;
export const REORDER_SCAN_CONSISTENCY = 'REQUEST_SNAPSHOT_ONLY';

export type ReorderScanQuery = Readonly<{
  take: number;
  skip: number;
  onlyNeedsReorder: boolean;
}>;

function numericField(input: unknown, field: string, fallback: number, min: number, max: number): number {
  if (input === undefined) return fallback;
  if (typeof input !== 'string' || !/^(0|[1-9]\d*)$/.test(input)) {
    throw new TypeError('REORDER_SCAN_' + field + '_INVALID');
  }
  const n = Number(input);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new TypeError('REORDER_SCAN_' + field + '_INVALID');
  }
  return n;
}

export function parseReorderScanQuery(raw: Record<string, unknown>): ReorderScanQuery {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Reflect.ownKeys(raw).some(key => typeof key !== 'string' ||
        !['take', 'skip', 'onlyNeedsReorder'].includes(key))) {
    throw new TypeError('REORDER_SCAN_QUERY_INVALID');
  }
  // Read ONLY own data properties. Inherited query keys or accessors are not
  // trusted request parameters (e.g. prototype pollution from nested parsers).
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  for (const name of ['take', 'skip', 'onlyNeedsReorder'] as const) {
    if ((name in raw && !Object.hasOwn(raw, name)) ||
        (Object.hasOwn(descriptors, name) && !Object.hasOwn(descriptors[name], 'value'))) {
      throw new TypeError('REORDER_SCAN_QUERY_INVALID');
    }
  }
  const take = numericField(descriptors.take?.value, 'take', REORDER_SCAN_DEFAULT_TAKE, 1, REORDER_SCAN_MAX_TAKE);
  const skip = numericField(descriptors.skip?.value, 'skip', 0, 0, REORDER_SCAN_MAX_SKIP);
  const flag = descriptors.onlyNeedsReorder?.value;
  if (flag !== undefined && (typeof flag !== 'string' || !/^(true|false)$/i.test(flag))) {
    throw new TypeError('REORDER_SCAN_FILTER_INVALID');
  }
  return { take, skip, onlyNeedsReorder: typeof flag === 'string' && flag.toLowerCase() === 'true' };
}

export function reorderScanPageMeta(input: {
  skip: number;
  take: number;
  scannedProducts: number;
  activeProducts: number;
  matchesInPage: number;
}) {
  const { skip, take, scannedProducts, activeProducts, matchesInPage } = input;
  if (![skip, take, scannedProducts, activeProducts, matchesInPage].every(Number.isSafeInteger) ||
      skip < 0 || skip > REORDER_SCAN_MAX_SKIP || take < 1 || take > REORDER_SCAN_MAX_TAKE ||
      activeProducts < 0 || scannedProducts < 0 || scannedProducts > take ||
      matchesInPage < 0 || matchesInPage > scannedProducts ||
      scannedProducts !== Math.min(take, Math.max(activeProducts - skip, 0))) {
    throw new TypeError('REORDER_SCAN_INCONSISTENT_PAGE');
  }
  const hasMore = skip + scannedProducts < activeProducts;
  // Never promise a continuation offset that parseReorderScanQuery must reject.
  // A bounded offset scan cannot claim full coverage beyond this range.
  if (hasMore && skip + scannedProducts > REORDER_SCAN_MAX_SKIP) {
    throw new TypeError('REORDER_SCAN_OFFSET_WINDOW_EXCEEDED');
  }
  return {
    skip,
    take,
    scannedProducts,
    totalActiveProducts: activeProducts,
    matchesInPage,
    hasMore,
    nextSkip: hasMore ? skip + scannedProducts : null,
    truncated: skip > 0 || hasMore,
    pageScoped: true as const,
    consistency: REORDER_SCAN_CONSISTENCY,
    // Filtering happens after fetching the page; scanning every page is
    // necessary to enumerate all matching reorder candidates.
    matchingScope: 'SCANNED_CATALOG_PAGE_ONLY' as const
  };
}
