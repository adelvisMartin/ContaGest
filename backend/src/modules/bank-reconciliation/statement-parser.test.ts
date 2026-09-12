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

test('CSV formula injection falla seguro',()=>{
  assert.throws(()=>parse('estado.csv','date,amount,reference,memo\n2026-09-01,100.00,=HYPERLINK("x"),Pago\n'),(error:any)=>error?.details?.code==='BANK_STATEMENT_FORMULA_CELL'||error?.code==='BANK_STATEMENT_FORMULA_CELL'||/potencialmente ejecutable/i.test(error?.message));
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
