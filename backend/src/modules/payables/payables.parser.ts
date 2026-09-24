import { createHash } from 'node:crypto';

export type ConfidenceField<T> = { value: T | null; confidence: number; source?: string };
export type ParsedLine = {
  description: ConfidenceField<string>;
  quantity: ConfidenceField<string>;
  unitCost: ConfidenceField<string>;
  taxRate: ConfidenceField<string>;
};
export type PayableExtraction = {
  supplierName: ConfidenceField<string>;
  supplierRif: ConfidenceField<string>;
  invoiceNumber: ConfidenceField<string>;
  issueDate: ConfidenceField<string>;
  currency: ConfidenceField<string>;
  subtotal: ConfidenceField<string>;
  tax: ConfidenceField<string>;
  total: ConfidenceField<string>;
  poReference: ConfidenceField<string>;
  receiptReference: ConfidenceField<string>;
  lines: ParsedLine[];
  warnings: string[];
};

export type ParserInput = {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
};

export interface PayableDocumentParser {
  readonly name: string;
  readonly version: string;
  parse(input: ParserInput): Promise<PayableExtraction>;
}

const field = <T>(value: T | null, confidence = 0, source = 'local-heuristic'): ConfidenceField<T> => ({ value, confidence, source });
const decimal = (value?: string | null) => {
  if (!value) return null;
  const normalized = value.replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized : null;
};

function visibleText(bytes: Buffer) {
  const latin = bytes.toString('latin1');
  return latin
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
    .replace(/\\[nrt]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 1_000_000);
}

function capture(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function captureLast(text: string, pattern: RegExp) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  let value: string | null = null;
  for (const match of text.matchAll(globalPattern)) {
    if (match[1]) value = match[1].trim();
  }
  return value;
}

function dateIso(value: string | null) {
  if (!value) return null;
  const match = value.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (!match) return null;
  const [, d, m, y] = match;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function extractLines(text: string): ParsedLine[] {
  const rows: ParsedLine[] = [];
  const pattern = /(?:L[IÍ]NEA|ITEM|PRODUCTO)\s*[:#-]?\s*(.{2,120}?)\s+(?:CANT(?:IDAD)?|QTY)\s*[:#-]?\s*([\d.,]+)\s+(?:PRECIO(?:\s+UNITARIO)?|UNIT(?:\s+PRICE)?|P\.?\s*U\.?)\s*[:#-]?\s*([\d.,]+)\s+(?:IVA|TAX)\s*[:#-]?\s*([\d.,]+)\s*%?(?=\s+(?:L[IÍ]NEA|ITEM|PRODUCTO|SUBTOTAL|TOTAL|ORDEN\s+DE\s+COMPRA|PURCHASE\s+ORDER|PO|RECEPCI[ÓO]N|RECEPCION|RECEIPT|GRN)\b|$)/giu;
  for (const match of text.matchAll(pattern)) {
    const description = String(match[1] || '').trim();
    const quantity = decimal(match[2]);
    const unitCost = decimal(match[3]);
    const taxRate = decimal(match[4]);
    if (!description || quantity == null || unitCost == null || taxRate == null) continue;
    rows.push({
      description: field(description, 0.9, 'local-line-heuristic'),
      quantity: field(quantity, 0.93, 'local-line-heuristic'),
      unitCost: field(unitCost, 0.93, 'local-line-heuristic'),
      taxRate: field(taxRate, 0.9, 'local-line-heuristic')
    });
    if (rows.length >= 200) break;
  }
  return rows;
}

export class SafeLocalParser implements PayableDocumentParser {
  readonly name = 'safe-local';
  constructor(readonly version = '1.0.0') {}

  async parse(input: ParserInput): Promise<PayableExtraction> {
    const text = visibleText(input.bytes);
    const rif = capture(text, [/(?:RIF|R\.I\.F\.?)[\s:#-]*([JGVEP]-?\d{7,10}-?\d?)/i]);
    const invoiceNumber = capture(text, [/(?:FACTURA|INVOICE|NRO\.?|N[ÚU]MERO)[\s:#-]*(?:N[°º]\s*)?([A-Z0-9-]{3,30})/i]);
    const rawDate = capture(text, [/(?:FECHA|DATE)[\s:#-]*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i]);
    const subtotal = decimal(capture(text, [/(?:SUBTOTAL|BASE IMPONIBLE)[\s:$Bs.VESUSD]*([\d.,-]+)/i]));
    const tax = decimal(captureLast(text, /(?:IVA|IMPUESTO)[^\d]{0,20}([\d.,-]+)/i));
    const total = decimal(capture(text, [/\bTOTAL(?:\s+A\s+PAGAR)?[\s:$Bs.VESUSD]*([\d.,-]+)/i]));
    const po = capture(text, [/(?:PO|ORDEN DE COMPRA|PURCHASE ORDER)[\s:#-]*([A-Z0-9-]{2,40})/i]);
    const receipt = capture(text, [/(?:RECEPCI[ÓO]N|RECEIPT|GRN)[\s:#-]*([A-Z0-9-]{2,40})/i]);
    const currencyRaw = capture(text, [/(?:MONEDA|CURRENCY)[\s:#-]*(VES|USD|EUR)/i])
      || (/\bUSD\b|US\$|\$\s*\d/.test(text) ? 'USD' : /\bVES\b|Bs\.?\s*\d/i.test(text) ? 'VES' : null);
    const supplierName = capture(text, [/(?:PROVEEDOR|SUPPLIER)[\s:#-]*([A-ZÁÉÍÓÚÑ0-9 .,&'-]{3,80})/i]);

    const lines = extractLines(text);
    const extractedCount = [rif, invoiceNumber, rawDate, subtotal, tax, total, po, receipt, currencyRaw, supplierName].filter(Boolean).length + (lines.length ? 1 : 0);
    const warnings: string[] = [];
    if (input.mimeType !== 'application/pdf') warnings.push('Imagen recibida: el parser local no ejecuta OCR visual; requiere revisión humana o provider aprobado.');
    if (extractedCount < 3) warnings.push('Extracción limitada. Confirma manualmente los campos de baja confianza.');

    const confidence = (value: unknown, strong = 0.93) => value ? strong : 0.15;
    return {
      supplierName: field(supplierName, confidence(supplierName, 0.82)),
      supplierRif: field(rif?.toUpperCase() || null, confidence(rif, 0.96)),
      invoiceNumber: field(invoiceNumber, confidence(invoiceNumber, 0.9)),
      issueDate: field(dateIso(rawDate), confidence(rawDate, 0.9)),
      currency: field(currencyRaw?.toUpperCase() || null, confidence(currencyRaw, 0.88)),
      subtotal: field(subtotal, confidence(subtotal, 0.9)),
      tax: field(tax, confidence(tax, 0.88)),
      total: field(total, confidence(total, 0.93)),
      poReference: field(po, confidence(po, 0.86)),
      receiptReference: field(receipt, confidence(receipt, 0.86)),
      lines,
      warnings
    };
  }
}

export function parserForVersion(version?: string) {
  const normalized = String(version || '1.0.0');
  if (!['1.0.0', '2.0.0'].includes(normalized)) throw Object.assign(new Error(`Versión de parser no soportada: ${normalized}`), { code: 'PARSER_VERSION_UNSUPPORTED' });
  return new SafeLocalParser(normalized);
}

export function extractionFingerprint(extraction: PayableExtraction) {
  return createHash('sha256').update(JSON.stringify(extraction)).digest('hex');
}

export function lowConfidenceFields(extraction: PayableExtraction, threshold = 0.8) {
  const topLevel = Object.entries(extraction)
    .filter(([key, value]) => key !== 'lines' && key !== 'warnings' && value && typeof value === 'object' && 'confidence' in value && Number((value as ConfidenceField<unknown>).confidence) < threshold)
    .map(([key]) => key);
  const lineFields = (extraction.lines || []).flatMap((line, index) =>
    Object.entries(line)
      .filter(([, value]) => value && typeof value === 'object' && 'confidence' in value && Number((value as ConfidenceField<unknown>).confidence) < threshold)
      .map(([key]) => `lines.${index}.${key}`)
  );
  return [...topLevel, ...lineFields];
}
