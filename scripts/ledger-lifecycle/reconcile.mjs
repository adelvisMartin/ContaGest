export const LEDGER_RECONCILIATION_SQL = String.raw`
WITH ledger AS (
  SELECT le."id", le."tenantId", le."posted", le."source"::text AS source, le."sourceId",
         le."salesInvoiceId", le."purchaseInvoiceId", COUNT(ll.*) line_count,
         COALESCE(SUM(ll."debit"),0) debit, COALESCE(SUM(ll."credit"),0) credit
  FROM public."LedgerEntry" le LEFT JOIN public."LedgerLine" ll ON ll."entryId"=le."id"
  GROUP BY le."id"
), docs AS (
  SELECT s."id", s."tenantId", 'sales'::text kind FROM public."SalesInvoice" s WHERE s."status" IN ('issued','paid','overdue')
  UNION ALL
  SELECT p."id", p."tenantId", 'purchase'::text FROM public."PurchaseInvoice" p WHERE p."status" IN ('issued','paid','overdue')
), classified_docs AS (
  SELECT d.*,
    EXISTS(SELECT 1 FROM ledger l WHERE l."tenantId"=d."tenantId" AND l.source=d.kind AND (l."sourceId"=d."id" OR (d.kind='sales' AND l."salesInvoiceId"=d."id") OR (d.kind='purchase' AND l."purchaseInvoiceId"=d."id")) AND l.posted) has_posted,
    EXISTS(SELECT 1 FROM ledger l WHERE l."tenantId"=d."tenantId" AND l.source=d.kind AND (l."sourceId"=d."id" OR (d.kind='sales' AND l."salesInvoiceId"=d."id") OR (d.kind='purchase' AND l."purchaseInvoiceId"=d."id")) AND NOT l.posted) has_draft
  FROM docs d
)
SELECT jsonb_build_object(
  'DOCUMENT_WITH_VALID_LEDGER', (SELECT COUNT(*) FROM classified_docs WHERE has_posted),
  'DOCUMENT_WITH_DRAFT_LEDGER', (SELECT COUNT(*) FROM classified_docs WHERE NOT has_posted AND has_draft),
  'DOCUMENT_WITHOUT_LEDGER', (SELECT COUNT(*) FROM classified_docs WHERE NOT has_posted AND NOT has_draft),
  'LEDGER_WITHOUT_SOURCE', (SELECT COUNT(*) FROM ledger WHERE source <> 'manual' AND "sourceId" IS NULL AND "salesInvoiceId" IS NULL AND "purchaseInvoiceId" IS NULL),
  'UNBALANCED_LEDGER', (SELECT COUNT(*) FROM ledger WHERE debit <> credit OR line_count < 2),
  'POSTING_ELIGIBLE', (SELECT COUNT(*) FROM ledger WHERE NOT posted AND debit = credit AND line_count >= 2),
  'REQUIRES_MANUAL_ACCOUNTING_DECISION', (SELECT COUNT(*) FROM classified_docs WHERE NOT has_posted AND NOT has_draft)
) AS classifications;`;

export function assertReadOnlySql(sql) {
  const scrubbed=sql.replace(/--.*$/gm,' ').replace(/\/\*[\s\S]*?\*\//g,' ');
  if(/\b(insert|update|delete|alter|drop|truncate|create|grant|revoke|merge|copy)\b/i.test(scrubbed)) throw new Error('LEDGER_AUDIT_MUST_BE_READ_ONLY');
  return true;
}

export function normalizeClassifications(value={}) {
  const keys=['DOCUMENT_WITH_VALID_LEDGER','DOCUMENT_WITH_DRAFT_LEDGER','DOCUMENT_WITHOUT_LEDGER','LEDGER_WITHOUT_SOURCE','UNBALANCED_LEDGER','POSTING_ELIGIBLE','REQUIRES_MANUAL_ACCOUNTING_DECISION'];
  return Object.fromEntries(keys.map((key)=>[key,Number(value[key]??0)]));
}
