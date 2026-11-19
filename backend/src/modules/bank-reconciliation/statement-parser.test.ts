import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBankStatement, statementLineHash } from './statement-parser.js';

const parse=(name:string,text:string)=>parseBankStatement({fileName:name,bytes:Buffer.from(text,'utf8'),defaultCurrency:'VES'});

test('CSV exacto conserva referencia y monto Decimal',()=>{
  const result=parse('estado.csv','date,amount,currency,reference,memo,counterparty\n2026-09-01,-10.25,VES,ABC-1,Comision Banco,Banco Uno\n');
  assert.equal(result.format,'csv');assert.equal(result.lines[0].amount,'-10.25');assert.equal(result.lines[0].reference,'ABC-1');assert.match(statementLineHash(result.lines[0]),/^[a-f0-9]{64}$/);
});

test('CSV entrecomillado admite comas sin romper columnas',()=>{
  const result=parse('estado.csv','date,amount,reference,memo\n2026-09-01,100.00,REF-1,"Pago, cliente uno"\n');
  assert.equal(result.lines[0].memo,'Pago, cliente uno');
});

test('CSV formula injection falla seguro en campos conocidos',()=>{
  assert.throws(()=>parse('estado.csv','date,amount,reference,memo\n2026-09-01,100.00,=HYPERLINK("x"),Pago\n'),(error:any)=>error?.details?.code==='BANK_STATEMENT_FORMULA_CELL'||error?.code==='BANK_STATEMENT_FORMULA_CELL'||/potencialmente ejecutable/i.test(error?.message));
  assert.throws(()=>parse('estado.csv','date,amount,reference,memo\n2026-09-01,100.00,REF-1,-1+2\n'),(error:any)=>error?.details?.code==='BANK_STATEMENT_FORMULA_CELL'||/potencialmente ejecutable/i.test(error?.message));
});

test('CSV rejects hidden Unicode prefixes before formulas in bank memo/reference/raw fields',()=>{
  for(const value of [
    '\u200b=HYPERLINK("https://invalid.example")',
    '\u2060@SUM(A1)',
    '\u034f+SUM(1)',
    '\ufeff-2+3',
    '\u180e=1+1'
  ]){
    for(const field of ['reference','memo','extra']){
      const csv=`date,amount,${field}\n2026-09-01,100.00,"${value.replaceAll('"','""')}"\n`;
      assert.throws(()=>parse('estado.csv',csv),(error:any)=>
        error?.details?.code==='BANK_STATEMENT_FORMULA_CELL'
        || error?.code==='BANK_STATEMENT_FORMULA_CELL'
        || /potencialmente ejecutable/i.test(error?.message),`${field}:${JSON.stringify(value)}`);
    }
  }
  const numericReference=parse('estado.csv','date,amount,reference\n2026-09-01,100.00,-125.50\n');
  assert.equal(numericReference.lines[0].reference,'-125.50');
});

test('CSV formula injection falla seguro también en columnas raw no mapeadas',()=>{
  assert.throws(()=>parse('estado.csv','date,amount,reference,extra\n2026-09-01,100.00,REF-1,@SUM(A1:A2)\n'),(error:any)=>error?.details?.code==='BANK_STATEMENT_FORMULA_CELL'||/potencialmente ejecutable/i.test(error?.message));
});

test('CSV corrupto con comillas abiertas falla seguro',()=>{
  assert.throws(()=>parse('estado.csv','date,amount,memo\n2026-09-01,10.00,"sin cerrar\n'),/malformado/i);
});

test('OFX/QFX normaliza FITID y saldo de cierre',()=>{
  const result=parse('estado.ofx','<OFX><CURDEF>USD<BANKTRANLIST><STMTTRN><DTPOSTED>20260901<TRNAMT>-4.50<FITID>F-1<MEMO>FEE</BANKTRANLIST><LEDGERBAL><BALAMT>95.50</OFX>');
  assert.equal(result.currency,'USD');assert.equal(result.lines[0].bankLineId,'F-1');assert.equal(result.closingBalance,'95.50');
});

test('CAMT rechaza DTD/ENTITY y parsea XML básico seguro',()=>{
  assert.throws(()=>parse('estado.xml','<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><Document/>'),/DTD\/ENTITY/i);
  const result=parse('estado.xml','<Document><BkToCstmrStmt><Ntry><Amt Ccy="VES">12.34</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-09-02</Dt></BookgDt><NtryRef>N-1</NtryRef><AddtlNtryInf>Deposito</AddtlNtryInf></Ntry></BkToCstmrStmt></Document>');
  assert.equal(result.lines[0].amount,'12.34');assert.equal(result.lines[0].reference,'N-1');
});

test('archivo binario y oversized se rechazan antes de parsear',()=>{
  assert.throws(()=>parseBankStatement({fileName:'x.csv',bytes:Buffer.from([1,0,2]),defaultCurrency:'VES'}),/binario\/corrupto/i);
  assert.throws(()=>parseBankStatement({fileName:'x.csv',bytes:Buffer.alloc(5*1024*1024+1,65),defaultCurrency:'VES'}),(error:any)=>error?.status===413||/5 MB/.test(error?.message));
});


test('CSV rejects ambiguous bank amount, date and metadata headers before import',()=>{
  for(const [header,values] of [
    ['date,amount,monto','2026-09-01,12.00,99.00'],
    ['date,fecha,amount','2026-09-01,2026-09-02,12.00'],
    ['date,amount,ref,referencia','2026-09-01,12.00,REF-1,REF-2'],
    ['date,amount,valueDate,fecha_valor','2026-09-01,12.00,2026-09-01,2026-09-02'],
    ['date,amount,extra,EXTRA','2026-09-01,12.00,one,two']
  ]){
    assert.throws(()=>parse('estado.csv',`${header}\n${values}\n`),
      /cabeceras duplicadas o ambiguas/i,header);
  }
});

test('CSV preserves Spanish fecha_valor and reuses one FITID for id/reference',()=>{
  const result=parse('estado.csv','fecha,fecha_valor,monto,FITID\n2026-09-01,2026-09-02,12.34,REF-A\n');
  assert.equal(result.lines.length,1);
  assert.equal(result.lines[0].bookedAt.toISOString(),'2026-09-01T00:00:00.000Z');
  assert.equal(result.lines[0].valueDate?.toISOString(),'2026-09-02T00:00:00.000Z');
  assert.equal(result.lines[0].amount,'12.34');
  assert.equal(result.lines[0].bankLineId,'REF-A');
  assert.equal(result.lines[0].reference,'REF-A');
});
