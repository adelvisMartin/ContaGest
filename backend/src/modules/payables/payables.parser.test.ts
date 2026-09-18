import assert from 'node:assert/strict';
import test from 'node:test';
import { SafeLocalParser, lowConfidenceFields } from './payables.parser.js';
import { PAYABLE_MAX_BYTES, validatePayableUpload } from './payables.service.js';

const pdf = (text:string) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type /Page>>endobj\nBT ${text} ET\n%%EOF`,'latin1');

test('safe-local parser extracts traceable AP fields and exposes confidence per field', async () => {
  const parser = new SafeLocalParser('1.0.0');
  const result = await parser.parse({
    bytes:pdf('PROVEEDOR ACME INDUSTRIAL C.A. RIF J-12345678-9 FACTURA FAC-1001 FECHA 06/09/2026 MONEDA USD ITEM Servicio técnico CANT 2 PRECIO 25 IVA 16 ITEM Repuesto A CANTIDAD 1 PRECIO UNITARIO 50 IVA 16 SUBTOTAL 100,00 IVA 16,00 TOTAL 116,00 ORDEN DE COMPRA PO-77 RECEPCION GRN-9'),
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
  assert.equal(result.lines.length,2);
  assert.deepEqual(result.lines.map((line)=>({
    description:line.description.value,
    quantity:line.quantity.value,
    unitCost:line.unitCost.value,
    taxRate:line.taxRate.value
  })),[
    {description:'Servicio técnico',quantity:'2',unitCost:'25',taxRate:'16'},
    {description:'Repuesto A',quantity:'1',unitCost:'50',taxRate:'16'}
  ]);
  assert.ok(result.lines.every((line)=>line.quantity.confidence>=0.9&&line.unitCost.confidence>=0.9));
  assert.ok(result.supplierRif.confidence >= 0.9);
});

test('image without visual OCR is review-only and low confidence is explicit', async () => {
  const parser = new SafeLocalParser();
  const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0xff,0xd9]);
  const result = await parser.parse({bytes:jpeg,mimeType:'image/jpeg',fileName:'scan.jpg'});
  assert.ok(result.warnings.some((item)=>item.includes('revisión humana')));
  assert.ok(lowConfidenceFields(result).includes('invoiceNumber'));
});

test('low confidence includes nested invoice-line fields', () => {
  const extraction = {
    supplierName:{value:'Proveedor',confidence:.9},supplierRif:{value:'J-1',confidence:.9},invoiceNumber:{value:'F-1',confidence:.9},
    issueDate:{value:'2026-09-17',confidence:.9},currency:{value:'VES',confidence:.9},subtotal:{value:'10',confidence:.9},
    tax:{value:'0',confidence:.9},total:{value:'10',confidence:.9},poReference:{value:null,confidence:.9},receiptReference:{value:null,confidence:.9},
    lines:[{description:{value:'Producto',confidence:.9},quantity:{value:'1',confidence:.6},unitCost:{value:'10',confidence:.95},taxRate:{value:'0',confidence:.95}}],
    warnings:[]
  };
  assert.deepEqual(lowConfidenceFields(extraction as any),['lines.0.quantity']);
});

test('upload validation rejects spoofed, active-content and oversized files', () => {
  assert.throws(()=>validatePayableUpload(Buffer.from('not a pdf'),'application/pdf'),/Content-Type/i);
  assert.throws(()=>validatePayableUpload(pdf('/JavaScript app.alert(1)'),'application/pdf'),/maliciosa/i);
  assert.throws(()=>validatePayableUpload(Buffer.concat([Buffer.from('%PDF-'),Buffer.alloc(PAYABLE_MAX_BYTES)]),'application/pdf'),/8 MiB/i);
});

test('upload validation accepts declared PDF only when magic bytes agree', () => {
  assert.equal(validatePayableUpload(pdf('FACTURA X-1 TOTAL 10'),'application/pdf'),'application/pdf');
});
