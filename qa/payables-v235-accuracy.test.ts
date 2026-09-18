import assert from 'node:assert/strict';
import test from 'node:test';
import { SafeLocalParser } from '../backend/src/modules/payables/payables.parser.js';

const pdf = (text:string) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type /Page>>endobj\nBT ${text} ET\n%%EOF`,'latin1');
const corpus = [
  { name:'ves-digital', text:'PROVEEDOR DISTRIBUIDORA UNO C.A. RIF J-11111111-1 FACTURA A-100 FECHA 01/09/2026 MONEDA VES ITEM Insumo A CANT 2 PRECIO 500 IVA 16 SUBTOTAL 1000,00 IVA 160,00 TOTAL 1160,00 ORDEN DE COMPRA PO-1 RECEPCION GRN-1', expected:{supplierRif:'J-11111111-1',invoiceNumber:'A-100',issueDate:'2026-09-01',currency:'VES',subtotal:'1000.00',tax:'160.00',total:'1160.00',poReference:'PO-1',receiptReference:'GRN-1'}, expectedLine:{description:'Insumo A',quantity:'2',unitCost:'500',taxRate:'16'} },
  { name:'usd-digital', text:'SUPPLIER ACME LLC RIF J-22222222-2 INVOICE INV-900 DATE 02/09/2026 CURRENCY USD SUBTOTAL 250.50 IVA 40.08 TOTAL 290.58 PO PO-900 RECEIPT GRN-900', expected:{supplierRif:'J-22222222-2',invoiceNumber:'INV-900',issueDate:'2026-09-02',currency:'USD',subtotal:'250.50',tax:'40.08',total:'290.58',poReference:'PO-900',receiptReference:'GRN-900'} },
  { name:'partial-po', text:'RIF J-33333333-3 FACTURA FC-33 FECHA 03/09/2026 MONEDA VES SUBTOTAL 75 IVA 12 TOTAL 87 ORDEN DE COMPRA OC-33', expected:{supplierRif:'J-33333333-3',invoiceNumber:'FC-33',issueDate:'2026-09-03',currency:'VES',subtotal:'75',tax:'12',total:'87',poReference:'OC-33'} }
] as const;

test('field accuracy report over sanitized synthetic digital-PDF corpus', async () => {
  const parser=new SafeLocalParser('1.0.0');
  const counters:Record<string,{correct:number;total:number}>={};
  for(const fixture of corpus){
    const result=await parser.parse({bytes:pdf(fixture.text),mimeType:'application/pdf',fileName:`${fixture.name}.pdf`});
    for(const [key,expected] of Object.entries(fixture.expected)){
      counters[key] ||= {correct:0,total:0};
      counters[key].total += 1;
      const actual=(result as any)[key]?.value;
      if(String(actual)===String(expected)) counters[key].correct += 1;
    }
    if('expectedLine' in fixture && fixture.expectedLine){
      const line=result.lines[0];
      for(const [key,expected] of Object.entries(fixture.expectedLine)){
        const metric=`line.${key}`;
        counters[metric] ||= {correct:0,total:0};
        counters[metric].total += 1;
        const actual=(line as any)?.[key]?.value;
        if(String(actual)===String(expected)) counters[metric].correct += 1;
      }
    }
  }
  const report=Object.fromEntries(Object.entries(counters).map(([key,value])=>[key,{...value,accuracy:Number((value.correct/value.total).toFixed(4))}]));
  console.log('PAYABLES_V235_FIELD_ACCURACY',JSON.stringify({parser:'safe-local@1.0.0',corpus:corpus.length,report}));
  for(const [key,value] of Object.entries(report)) assert.equal(value.accuracy,1,`accuracy regression for ${key}`);
});
