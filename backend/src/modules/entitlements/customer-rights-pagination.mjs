// @ts-check
// A bounded sentinel page avoids silently hiding later customer entitlements.
/**
 * @template T
 * @param {T[]} rows Already tenant-filtered and deterministically ordered.
 * @param {{skip:number,take:number}} page
 */
export function customerRightsPage(rows, page) {
  if (!Array.isArray(rows) || !page ||
      !Number.isSafeInteger(page.skip) || page.skip < 0 || page.skip > 100000 ||
      !Number.isSafeInteger(page.take) || page.take < 1 || page.take > 100)
    throw new TypeError('ENTITLEMENT_PAGINATION_INVALID');
  const hasMore = rows.length > page.take;
  return Object.freeze({
    items: rows.slice(0, page.take),
    hasMore,
    nextSkip: hasMore ? page.skip + page.take : null
  });
}
