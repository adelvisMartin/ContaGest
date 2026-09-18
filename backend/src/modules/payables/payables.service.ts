import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { lowConfidenceFields, parserForVersion, type PayableExtraction } from './payables.parser.js';

export const PAYABLE_MAX_BYTES = 8 * 1024 * 1024;
export const PAYABLE_ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const LOW_CONFIDENCE_THRESHOLD = 0.8;
const RETENTION_DAYS = Math.max(1, Number(process.env.PAYABLE_RETENTION_DAYS || 3650));

type DocumentRow = {
  id: string;
  tenantId: string;
  supplierId: string | null;
  purchaseInvoiceId: string | null;
  duplicateOfId: string | null;
  documentHash: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sourceMetadata: Record<string, unknown>;
  uploaderId: string | null;
  uploadedAt: Date;
  state: string;
  suspectedDuplicate: boolean;
  supplierReference: string | null;
  parserName: string | null;
  parserVersion: string | null;
  parserResult: PayableExtraction | null;
  matchMode: string;
  matchResult: Record<string, unknown>;
  reviewedData: Record<string, unknown> | null;
  reviewStatus: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  retentionUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DocumentWithBytes = DocumentRow & { originalContent: Buffer };

function sniffMime(bytes: Buffer) {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export function validatePayableUpload(bytes: Buffer, declaredMime: string) {
  if (!bytes.length) throw new HttpError(422, 'El documento está vacío.', { code: 'PAYABLE_EMPTY_FILE' });
  if (bytes.length > PAYABLE_MAX_BYTES) throw new HttpError(413, 'El documento excede el límite de 8 MiB.', { code: 'PAYABLE_FILE_TOO_LARGE', maxBytes: PAYABLE_MAX_BYTES });
  const normalized = declaredMime.toLowerCase().split(';')[0].trim();
  if (!PAYABLE_ALLOWED_MIME.has(normalized)) throw new HttpError(415, 'Formato no permitido. Usa PDF, JPG, PNG o WebP.', { code: 'PAYABLE_UNSUPPORTED_MEDIA_TYPE' });
  const sniffed = sniffMime(bytes);
  if (!sniffed || sniffed !== normalized) throw new HttpError(415, 'El contenido real del archivo no coincide con su Content-Type.', { code: 'PAYABLE_CONTENT_TYPE_SPOOFED', declaredMime: normalized, detectedMime: sniffed });

  const probe = bytes.subarray(0, Math.min(bytes.length, 1_000_000)).toString('latin1');
  const malwareMarkers = ['EICAR-STANDARD-ANTIVIRUS-TEST-FILE', '/JavaScript', '/JS ', '/Launch', '/EmbeddedFile'];
  const marker = malwareMarkers.find((item) => probe.includes(item));
  if (marker) throw new HttpError(422, 'El documento contiene una característica activa o potencialmente maliciosa y fue bloqueado.', { code: 'PAYABLE_ACTIVE_CONTENT_BLOCKED' });
  if (normalized === 'application/pdf') {
    const pages = (probe.match(/\/Type\s*\/Page\b/g) || []).length;
    if (pages > 100) throw new HttpError(422, 'El PDF supera el máximo de 100 páginas.', { code: 'PAYABLE_PDF_PAGE_LIMIT', pages });
  }
  return normalized;
}

function retentionUntil() {
  return new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

async function getDocument(tenantId: string, id: string, withBytes = false) {
  const rows = withBytes
    ? await prisma.$queryRaw<DocumentWithBytes[]>`SELECT * FROM "PayableDocument" WHERE "tenantId" = ${tenantId} AND "id" = ${id} LIMIT 1`
    : await prisma.$queryRaw<DocumentRow[]>`SELECT "id","tenantId","supplierId","purchaseInvoiceId","duplicateOfId","documentHash","fileName","mimeType","sizeBytes","sourceMetadata","uploaderId","uploadedAt","state","suspectedDuplicate","supplierReference","parserName","parserVersion","parserResult","matchMode","matchResult","reviewedData","reviewStatus","reviewedBy","reviewedAt","retentionUntil","createdAt","updatedAt" FROM "PayableDocument" WHERE "tenantId" = ${tenantId} AND "id" = ${id} LIMIT 1`;
  if (!rows[0]) throw new HttpError(404, 'Documento de cuentas por pagar no encontrado.');
  return rows[0];
}

function recordReference(record: { title: string; payload: unknown }) {
  const payload = (record.payload || {}) as Record<string, unknown>;
  return String(payload.reference || payload.number || payload.poNumber || payload.receiptNumber || record.title || '').trim();
}

function lineDifferences(extracted: PayableExtraction, record: { payload: unknown } | null) {
  const expected = Array.isArray((record?.payload as any)?.lines) ? (record?.payload as any).lines : [];
  if (!expected.length || !extracted.lines.length) return [{ kind: 'lines_unavailable', expectedLines: expected.length, extractedLines: extracted.lines.length }];
  const differences: Array<Record<string, unknown>> = [];
  const length = Math.max(expected.length, extracted.lines.length);
  for (let index = 0; index < length; index += 1) {
    const e = expected[index] || null;
    const a = extracted.lines[index] || null;
    if (!e || !a) differences.push({ kind: 'line_count', line: index + 1, expected: e, extracted: a });
    else {
      const quantity = a.quantity.value;
      const unitCost = a.unitCost.value;
      const taxRate = a.taxRate.value;
      if (quantity != null && String(e.quantity ?? '') !== String(quantity)) differences.push({ kind: 'quantity', line: index + 1, expected: e.quantity, extracted: quantity });
      if (unitCost != null && String(e.unitCost ?? e.price ?? '') !== String(unitCost)) differences.push({ kind: 'price', line: index + 1, expected: e.unitCost ?? e.price, extracted: unitCost });
      if (taxRate != null && String(e.taxRate ?? '') !== String(taxRate)) differences.push({ kind: 'tax', line: index + 1, expected: e.taxRate, extracted: taxRate });
    }
  }
  return differences;
}

async function buildMatch(tenantId: string, extraction: PayableExtraction) {
  const rif = extraction.supplierRif.value;
  const supplier = rif ? await prisma.supplier.findFirst({ where: { tenantId, rif }, select: { id:true, rif:true, name:true } }) : null;
  const refs = [extraction.poReference.value, extraction.receiptReference.value].filter(Boolean).map((value) => String(value).toLowerCase());
  const records = refs.length ? await prisma.moduleRecord.findMany({
    where: { tenantId, moduleSlug: { in: ['purchase-order','purchase-orders','po','purchase-receipt','purchase-receipts','goods-receipt','receipts'] } },
    orderBy: { createdAt:'desc' },
    take: 500
  }) : [];
  const findByRef = (value: string | null, slugs: string[]) => value ? records.find((record) => slugs.includes(record.moduleSlug) && recordReference(record).toLowerCase() === value.toLowerCase()) || null : null;
  const po = findByRef(extraction.poReference.value, ['purchase-order','purchase-orders','po']);
  const receipt = findByRef(extraction.receiptReference.value, ['purchase-receipt','purchase-receipts','goods-receipt','receipts']);
  const mode = po && receipt ? '3-way' : po ? '2-way' : 'none';
  return {
    supplier,
    mode,
    result: {
      supplier: supplier ? { matched:true, id:supplier.id, rif:supplier.rif, name:supplier.name } : { matched:false, suggestedRif:rif },
      purchaseOrder: po ? { matched:true, id:po.id, reference:recordReference(po), differences:lineDifferences(extraction, po) } : { matched:false, reference:extraction.poReference.value },
      receipt: receipt ? { matched:true, id:receipt.id, reference:recordReference(receipt), differences:lineDifferences(extraction, receipt) } : { matched:false, reference:extraction.receiptReference.value },
      differencesPreserved:true
    }
  };
}

async function findReferenceDuplicate(tenantId: string, documentId: string, supplierId: string | null, reference: string | null) {
  if (!supplierId || !reference) return null;
  const rows = await prisma.$queryRaw<Array<{id:string; purchaseInvoiceId:string|null}>>`
    SELECT "id","purchaseInvoiceId" FROM "PayableDocument"
    WHERE "tenantId"=${tenantId} AND "supplierId"=${supplierId} AND "supplierReference"=${reference} AND "id"<>${documentId}
    ORDER BY "uploadedAt" ASC LIMIT 1`;
  return rows[0] || null;
}

export async function ingestPayableDocument(input: { tenantId:string; userId?:string; fileName:string; mimeType:string; bytes:Buffer; sourceMetadata?:Record<string,unknown> }) {
  const mimeType = validatePayableUpload(input.bytes, input.mimeType);
  const hash = createHash('sha256').update(input.bytes).digest('hex');
  const existing = await prisma.$queryRaw<DocumentRow[]>`SELECT "id","tenantId","supplierId","purchaseInvoiceId","duplicateOfId","documentHash","fileName","mimeType","sizeBytes","sourceMetadata","uploaderId","uploadedAt","state","suspectedDuplicate","supplierReference","parserName","parserVersion","parserResult","matchMode","matchResult","reviewedData","reviewStatus","reviewedBy","reviewedAt","retentionUntil","createdAt","updatedAt" FROM "PayableDocument" WHERE "tenantId"=${input.tenantId} AND "documentHash"=${hash} LIMIT 1`;
  if (existing[0]) return { document:existing[0], duplicate:true, exactHash:true };

  const id = randomUUID();
  const sourceJson = JSON.stringify(input.sourceMetadata || {});
  const until = retentionUntil();
  try {
    await prisma.$executeRaw`INSERT INTO "PayableDocument" ("id","tenantId","documentHash","fileName","mimeType","sizeBytes","originalContent","sourceMetadata","uploaderId","retentionUntil") VALUES (${id},${input.tenantId},${hash},${input.fileName.slice(0,240)},${mimeType},${input.bytes.length},${input.bytes},${sourceJson}::jsonb,${input.userId || null},${until})`;
  } catch (error: any) {
    if (error?.code === 'P2002') {
      const raced = await prisma.$queryRaw<DocumentRow[]>`SELECT "id","tenantId","supplierId","purchaseInvoiceId","duplicateOfId","documentHash","fileName","mimeType","sizeBytes","sourceMetadata","uploaderId","uploadedAt","state","suspectedDuplicate","supplierReference","parserName","parserVersion","parserResult","matchMode","matchResult","reviewedData","reviewStatus","reviewedBy","reviewedAt","retentionUntil","createdAt","updatedAt" FROM "PayableDocument" WHERE "tenantId"=${input.tenantId} AND "documentHash"=${hash} LIMIT 1`;
      if (raced[0]) return { document:raced[0], duplicate:true, exactHash:true };
    }
    throw error;
  }
  const document = await processPayableDocument(input.tenantId, id, '1.0.0');
  return { document, duplicate:false, exactHash:false };
}

export async function processPayableDocument(tenantId: string, documentId: string, version = '1.0.0') {
  const document = await getDocument(tenantId, documentId, true) as DocumentWithBytes;
  const parser = parserForVersion(version);
  const runId = randomUUID();
  const started = Date.now();
  await prisma.$executeRaw`UPDATE "PayableDocument" SET "state"='parsing', "updatedAt"=now() WHERE "tenantId"=${tenantId} AND "id"=${documentId}`;
  try {
    const extraction = await parser.parse({ bytes:Buffer.from(document.originalContent), mimeType:document.mimeType, fileName:document.fileName });
    const match = await buildMatch(tenantId, extraction);
    const reference = extraction.invoiceNumber.value;
    const duplicate = await findReferenceDuplicate(tenantId, documentId, match.supplier?.id || null, reference);
    const resultJson = JSON.stringify(extraction);
    const matchJson = JSON.stringify(match.result);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "PayableParserRun" ("id","tenantId","documentId","parserName","parserVersion","status","result","durationMs") VALUES (${runId},${tenantId},${documentId},${parser.name},${parser.version},'success',${resultJson}::jsonb,${Date.now()-started})`;
      await tx.$executeRaw`UPDATE "PayableDocument" SET "supplierId"=${match.supplier?.id || null}, "supplierReference"=${reference}, "parserName"=${parser.name}, "parserVersion"=${parser.version}, "parserResult"=COALESCE("parserResult",${resultJson}::jsonb), "matchMode"=${match.mode}, "matchResult"=${matchJson}::jsonb, "suspectedDuplicate"=${Boolean(duplicate)}, "duplicateOfId"=${duplicate?.id || null}, "state"='review', "updatedAt"=now() WHERE "tenantId"=${tenantId} AND "id"=${documentId}`;
    });
    return getDocument(tenantId, documentId);
  } catch (error: any) {
    const code = String(error?.code || 'PARSER_FAILED').slice(0,80);
    const safeMessage = String(error?.message || 'Parser failed').replace(/[\r\n\t]/g,' ').slice(0,240);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "PayableParserRun" ("id","tenantId","documentId","parserName","parserVersion","status","errorCode","errorMessage","durationMs") VALUES (${runId},${tenantId},${documentId},${parser.name},${parser.version},'error',${code},${safeMessage},${Date.now()-started})`;
      await tx.$executeRaw`UPDATE "PayableDocument" SET "state"='error', "parserName"=${parser.name}, "parserVersion"=${parser.version}, "updatedAt"=now() WHERE "tenantId"=${tenantId} AND "id"=${documentId}`;
    });
    throw new HttpError(422, 'No se pudo extraer el documento. El original quedó preservado y puede reprocesarse.', { code, documentId });
  }
}

export async function listPayableDocuments(tenantId: string, take = 100) {
  const limit = Math.min(Math.max(Number(take) || 100, 1), 500);
  return prisma.$queryRaw<DocumentRow[]>(Prisma.sql`SELECT "id","tenantId","supplierId","purchaseInvoiceId","duplicateOfId","documentHash","fileName","mimeType","sizeBytes","sourceMetadata","uploaderId","uploadedAt","state","suspectedDuplicate","supplierReference","parserName","parserVersion","parserResult","matchMode","matchResult","reviewedData","reviewStatus","reviewedBy","reviewedAt","retentionUntil","createdAt","updatedAt" FROM "PayableDocument" WHERE "tenantId"=${tenantId} ORDER BY "uploadedAt" DESC LIMIT ${limit}`);
}

export async function getPayableDocument(tenantId: string, id: string) {
  const document = await getDocument(tenantId, id);
  const runs = await prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT "id","parserName","parserVersion","status","errorCode","errorMessage","durationMs","createdAt","result" FROM "PayableParserRun" WHERE "tenantId"=${tenantId} AND "documentId"=${id} ORDER BY "createdAt" DESC`;
  const extraction = (runs.find((run) => run.status === 'success')?.result || document.parserResult || null) as PayableExtraction | null;
  return { ...document, parserRuns:runs, requiredConfirmations: extraction ? lowConfidenceFields(extraction, LOW_CONFIDENCE_THRESHOLD) : [] };
}

export async function getPayableContent(tenantId: string, id: string) {
  const document = await getDocument(tenantId, id, true) as DocumentWithBytes;
  return { bytes:Buffer.from(document.originalContent), fileName:document.fileName, mimeType:document.mimeType, hash:document.documentHash };
}

function mergedField(extraction: PayableExtraction, corrections: Record<string,unknown>, key: keyof PayableExtraction) {
  if (Object.prototype.hasOwnProperty.call(corrections, key)) return corrections[key as string];
  const item = extraction[key] as any;
  return item && typeof item === 'object' && 'value' in item ? item.value : item;
}

function decimalOrZero(value: unknown) {
  const text = String(value ?? '0').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,4})?$/.test(text)) throw new HttpError(422, `Monto inválido: ${text}`, { code:'PAYABLE_INVALID_DECIMAL' });
  return new Prisma.Decimal(text);
}

function reviewedLinesFrom(extraction: PayableExtraction, corrections: Record<string, unknown>) {
  const corrected = Array.isArray(corrections.lines) ? corrections.lines as Array<Record<string, unknown>> : null;
  const source: Array<Record<string, unknown>> = corrected || (extraction.lines || []).map((line) => ({
    description: line.description.value,
    quantity: line.quantity.value,
    unitCost: line.unitCost.value,
    taxRate: line.taxRate.value
  }));
  return source.map((line, index) => {
    const description = String(line['description'] || '').trim();
    if (!description) throw new HttpError(422, `La línea ${index + 1} requiere descripción.`, { code:'PAYABLE_LINE_DESCRIPTION_REQUIRED', line:index + 1 });
    const quantity = decimalOrZero(line['quantity']);
    const unitCost = decimalOrZero(line['unitCost']);
    const taxRate = decimalOrZero(line['taxRate']);
    const subtotal = quantity.mul(unitCost);
    const total = subtotal.plus(subtotal.mul(taxRate).div(100));
    return {
      description,
      productId: line['productId'] ? String(line['productId']) : null,
      quantity: quantity.toString(),
      unitCost: unitCost.toString(),
      taxRate: taxRate.toString(),
      total: total.toString()
    };
  });
}

export async function confirmPayableReview(input: { tenantId:string; userId:string; documentId:string; confirmedFields?:string[]; corrections?:Record<string,unknown> }) {
  const document = await getPayableDocument(input.tenantId, input.documentId);
  if (document.purchaseInvoiceId) {
    const purchase = await prisma.purchaseInvoice.findFirst({ where:{ id:document.purchaseInvoiceId, tenantId:input.tenantId }, include:{supplier:true,lines:true} });
    if (purchase) return { document, purchase, idempotent:true };
  }
  if (document.suspectedDuplicate) throw new HttpError(409, 'Posible duplicado detectado. No se creará una segunda obligación; revisa o rechaza el documento existente.', { code:'PAYABLE_DUPLICATE_REVIEW_REQUIRED', duplicateOfId:document.duplicateOfId });
  const successful = document.parserRuns.find((run:any) => run.status === 'success') as any;
  const extraction = (successful?.result || document.parserResult) as PayableExtraction | null;
  if (!extraction) throw new HttpError(409, 'El documento no tiene una extracción válida para revisar. Reprocésalo primero.');
  const corrections = input.corrections || {};
  const confirmed = new Set(input.confirmedFields || []);
  const required = lowConfidenceFields(extraction, LOW_CONFIDENCE_THRESHOLD);
  const hasLineCorrections = Array.isArray(corrections.lines);
  const unresolved = required.filter((key) => !confirmed.has(key)
    && !Object.prototype.hasOwnProperty.call(corrections,key)
    && !(key.startsWith('lines.') && hasLineCorrections));
  if (unresolved.length) throw new HttpError(422, 'Debes confirmar o corregir todos los campos de baja confianza.', { code:'PAYABLE_LOW_CONFIDENCE_UNRESOLVED', fields:unresolved });

  const invoiceNumber = String(mergedField(extraction, corrections, 'invoiceNumber') || '').trim();
  if (!invoiceNumber) throw new HttpError(422, 'Confirma o corrige el número de factura antes de crear el borrador.', { code:'PAYABLE_REFERENCE_REQUIRED' });
  const issueDateText = String(mergedField(extraction, corrections, 'issueDate') || new Date().toISOString().slice(0,10));
  const issueDate = new Date(`${issueDateText}T12:00:00.000Z`);
  if (Number.isNaN(issueDate.getTime())) throw new HttpError(422, 'La fecha revisada no es válida.', { code:'PAYABLE_DATE_INVALID' });
  const currency = String(mergedField(extraction, corrections, 'currency') || 'VES').toUpperCase();
  if (!['VES','USD','EUR'].includes(currency)) throw new HttpError(422, 'Moneda no soportada para el borrador.', { code:'PAYABLE_CURRENCY_INVALID' });

  let supplierId = String(corrections.supplierId || document.supplierId || '').trim() || null;
  if (supplierId) {
    const supplier = await prisma.supplier.findFirst({ where:{ id:supplierId, tenantId:input.tenantId, active:true }, select:{id:true} });
    if (!supplier) throw new HttpError(422, 'El proveedor seleccionado no pertenece al tenant o no está activo.', { code:'PAYABLE_SUPPLIER_INVALID' });
  }
  const reviewedLines = reviewedLinesFrom(extraction, corrections);
  const subtotal = decimalOrZero(corrections.subtotal ?? mergedField(extraction, corrections, 'subtotal'));
  const iva = decimalOrZero(corrections.tax ?? mergedField(extraction, corrections, 'tax'));
  const total = decimalOrZero(corrections.total ?? mergedField(extraction, corrections, 'total'));
  const fiscalPeriod = issueDate.toISOString().slice(0,7);
  const reviewedData = {
    invoiceNumber, issueDate:issueDate.toISOString(), currency, supplierId,
    subtotal:subtotal.toString(), tax:iva.toString(), total:total.toString(), lines:reviewedLines,
    confirmedFields:[...confirmed], corrections,
    parserRunId:successful?.id || null
  };

  const purchase = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseInvoice.create({
      data:{
        tenantId:input.tenantId,
        supplierId,
        number:invoiceNumber,
        issueDate,
        fiscalPeriod,
        subtotal,
        iva,
        total,
        status:'draft',
        ocrStatus:`reviewed:${document.parserName || 'parser'}@${document.parserVersion || 'unknown'}`,
        lines:{ create:reviewedLines.map((line) => ({
          productId:line.productId,
          description:line.description,
          quantity:new Prisma.Decimal(line.quantity),
          unitCost:new Prisma.Decimal(line.unitCost),
          taxRate:new Prisma.Decimal(line.taxRate),
          total:new Prisma.Decimal(line.total)
        })) }
      },
      include:{supplier:true,lines:true}
    });
    await tx.$executeRaw`UPDATE "PurchaseInvoice" SET "sourceDocumentId"=${input.documentId}, "currency"=${currency} WHERE "tenantId"=${input.tenantId} AND "id"=${created.id}`;
    await tx.$executeRaw`UPDATE "PayableDocument" SET "purchaseInvoiceId"=${created.id}, "reviewedData"=${JSON.stringify(reviewedData)}::jsonb, "reviewStatus"='confirmed', "reviewedBy"=${input.userId}, "reviewedAt"=now(), "state"='draft_created', "updatedAt"=now() WHERE "tenantId"=${input.tenantId} AND "id"=${input.documentId}`;
    return created;
  });
  return { document:await getPayableDocument(input.tenantId,input.documentId), purchase, idempotent:false };
}

export async function rejectPayableReview(tenantId:string, userId:string, documentId:string, reason:string) {
  await getDocument(tenantId, documentId);
  await prisma.$executeRaw`UPDATE "PayableDocument" SET "reviewStatus"='rejected', "reviewedBy"=${userId}, "reviewedAt"=now(), "reviewedData"=${JSON.stringify({reason})}::jsonb, "updatedAt"=now() WHERE "tenantId"=${tenantId} AND "id"=${documentId}`;
  return getPayableDocument(tenantId, documentId);
}
