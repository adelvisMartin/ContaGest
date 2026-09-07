import assert from 'node:assert/strict';
import test from 'node:test';
import { SafeLocalParser, lowConfidenceFields } from './payables.parser.js';
import { PAYABLE_MAX_BYTES, validatePayableUpload } from './payables.service.js';

const pdf = (text:string) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type /Page>>endobj\nBT ${text} ET\n%%EOF`,'latin1');

test('safe-local parser extracts traceable AP fields and exposes confidence per field', async () => {
  const parser = new SafeLocalParser('1.0.0');
  const result = await parser.parse({
    bytes:pdf('PROVEEDOR ACME INDUSTRIAL C.A. RIF J-12345678-9 FACTURA FAC-1001 FECHA 06/09/2026 MONEDA USD SUBTOTAL 100,00 IVA 16,00 TOTAL 116,00 ORDEN DE COMPRA PO-77 RECEPCION GRN-9'),
    mimeType:'application/pdf',
    fileName:'acme.pdf'
  });
  assert.equal(result.supplierRif.value,'J-12345678-9');
  assert.equal(result.invoiceNumber.value,'FAC-1001');
  assert.equal(result.issueDate.value,'2026-09-06');
  assert.equal(result.currency.value,'USD');
  assert.equal(result.subtotal.value,'100.00');
  assert.equal(result.tax.value,'16.00');
  assert.equal(result.total.value,'116.00');
  assert.equal(result.poReference.value,'PO-77');
  assert.equal(result.receiptReference.value,'GRN-9');
  assert.ok(result.supplierRif.confidence >= 0.9);
});

test('image without visual OCR is review-only and low confidence is explicit', async () => {
  const parser = new SafeLocalParser();
  const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0xff,0xd9]);
  const result = await parser.parse({bytes:jpeg,mimeType:'image/jpeg',fileName:'scan.jpg'});
  assert.ok(result.warnings.some((item)=>item.includes('revisión humana')));
  assert.ok(lowConfidenceFields(result).includes('invoiceNumber'));
});

test('upload validation rejects spoofed, active-content and oversized files', () => {
  assert.throws(()=>validatePayableUpload(Buffer.from('not a pdf'),'application/pdf'),/Content-Type/i);
  assert.throws(()=>validatePayableUpload(pdf('/JavaScript app.alert(1)'),'application/pdf'),/maliciosa/i);
  assert.throws(()=>validatePayableUpload(Buffer.concat([Buffer.from('%PDF-'),Buffer.alloc(PAYABLE_MAX_BYTES)]),'application/pdf'),/8 MiB/i);
});

test('upload validation accepts declared PDF only when magic bytes agree', () => {
  assert.equal(validatePayableUpload(pdf('FACTURA X-1 TOTAL 10'),'application/pdf'),'application/pdf');
});
