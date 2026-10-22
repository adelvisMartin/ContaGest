/** Shared guard for all fiscal document issuance boundaries (#751/#775/#776).
 * Never accept internal evidence keys or treat an externally registered record as
 * an issued invoice, withholding certificate, return or credit/debit note. */
export type FiscalDocumentRequest = Readonly<{
  module: string;
  kind: string;
  payload: Record<string, unknown>;
}>;
const RESERVED = /^(?:_|__proto__$|constructor$|prototype$)/i;
const regulatedModules = new Set(['iva','islr','retiva','igtf','municipal']);
const regulatedKinds = new Set(['invoice','credit_note','debit_note','withholding','tax_return']);
const denied = (code: string): never => { throw new Error(code); };

/** Valid for the reviewed /documents/issue route, not just for legacy manual insert. */
export function assertUntrustedFiscalPayload(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) denied('FISCAL_PAYLOAD_INVALID');
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (RESERVED.test(key)) denied('FISCAL_PAYLOAD_RESERVED_FIELD');
  }
}

/** External/manual register is not allowed to mint tax documents without provenance. */
export function assertExternalFiscalRecordAllowed(input: FiscalDocumentRequest): void {
  if (!input || typeof input !== 'object') denied('FISCAL_EXTERNAL_DOCUMENT_DENIED');
  assertUntrustedFiscalPayload(input.payload);
  if (regulatedModules.has(input.module) || regulatedKinds.has(input.kind)) {
    denied('FISCAL_EXTERNAL_DOCUMENT_DENIED');
  }
  if (input.module !== 'fiscal' || !['supporting_document','other'].includes(input.kind)) {
    denied('FISCAL_EXTERNAL_DOCUMENT_DENIED');
  }
}
