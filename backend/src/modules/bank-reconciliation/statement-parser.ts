import { createHash } from 'node:crypto';
import { HttpError } from '../../shared/http.js';
import { money, serializeDecimal } from '../../shared/financial/decimal.js';

export const BANK_STATEMENT_PARSER_VERSION='contagest-bank-statement/1.0.0';
export const MAX_STATEMENT_BYTES=5*1024*1024;
export type StatementFormat='csv'|'ofx'|'qfx'|'camt';
export type NormalizedStatementLine={bankLineId:string|null;bookedAt:Date;valueDate:Date|null;amount:string;currency:string;reference:string|null;memo:string|null;counterparty:string|null;raw:Record<string,unknown>};
export type ParsedStatement={format:StatementFormat;parserName:string;parserVersion:string;currency:string;openingBalance:string|null;closingBalance:string|null;lines:NormalizedStatementLine[]};

const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const clean=(value:unknown,max=1000)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
const safeText=(value:unknown,field:string,max=1000)=>{const text=clean(value,max);if(/^[=+@\t\r]/.test(text))throw new HttpError(422,`Celda potencialmente ejecutable en ${field}.`,{code:'BANK_STATEMENT_FORMULA_CELL',field});return text||null;};
const amount=(value:unknown)=>{const normalized=clean(value,80).replace(/\s/g,'').replace(/,(?=\d{1,2}$)/,'.').replace(/,/g,'');try{return serializeDecimal(money(normalized),2);}catch{throw new HttpError(422,'Monto inválido en extracto.',{code:'BANK_STATEMENT_AMOUNT_INVALID',value:clean(value,80)});}};
const date=(value:unknown,field='date')=>{const raw=clean(value,80);let parsed:Date;if(/^\d{8}/.test(raw))parsed=new Date(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T00:00:00.000Z`);else parsed=new Date(raw);if(Number.isNaN(parsed.getTime()))throw new HttpError(422,`Fecha inválida en ${field}.`,{code:'BANK_STATEMENT_DATE_INVALID',value:raw});return parsed;};
const normalizeCurrency=(value:unknown,fallback='VES')=>{const code=clean(value,8).toUpperCase()||fallback;if(!/^[A-Z]{3,4}$/.test(code))throw new HttpError(422,'Moneda inválida en extracto.',{code:'BANK_STATEMENT_CURRENCY_INVALID',value:code});return code;};

function csvRows(text:string){
  const rows:string[][]=[];let row:string[]=[];let cell='';let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;continue;}
    if(ch==='"'){quoted=true;continue;}if(ch===','){row.push(cell);cell='';continue;}if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';continue;}if(ch!=='\r')cell+=ch;
  }
  if(quoted)throw new HttpError(422,'CSV malformado: comillas sin cerrar.',{code:'BANK_STATEMENT_CSV_MALFORMED'});if(cell.length||row.length){row.push(cell);rows.push(row);}return rows.filter((item)=>item.some((value)=>value.trim()));
}
const aliases={date:['date','fecha','bookedat','bookingdate'],valueDate:['valuedate','fecha_valor','value_date'],amount:['amount','monto','importe','valor'],currency:['currency','moneda'],reference:['reference','referencia','ref','fitid'],memo:['memo','description','descripcion','concepto'],id:['id','bankid','bank_line_id','fitid'],counterparty:['counterparty','beneficiary','beneficiario','partner','contraparte']};
const key=(value:string)=>value.trim().toLowerCase().replace(/[\s-]+/g,'_').replace(/_/g,'');
const findHeader=(headers:string[],names:string[])=>headers.findIndex((header)=>names.includes(key(header)));
function parseCsv(text:string,defaultCurrency:string):ParsedStatement{
  const rows=csvRows(text);if(rows.length<2)throw new HttpError(422,'CSV sin líneas de movimiento.',{code:'BANK_STATEMENT_EMPTY'});const headers=rows[0];const indexes=Object.fromEntries(Object.entries(aliases).map(([name,names])=>[name,findHeader(headers,names)]));if(indexes.date<0||indexes.amount<0)throw new HttpError(422,'CSV requiere columnas de fecha y monto.',{code:'BANK_STATEMENT_CSV_HEADERS'});
  const lines=rows.slice(1).map((columns,rowIndex)=>{const raw=Object.fromEntries(headers.map((header,index)=>[header,columns[index]??'']));return {bankLineId:indexes.id>=0?safeText(columns[indexes.id],`id:${rowIndex}`,240):null,bookedAt:date(columns[indexes.date],`date:${rowIndex}`),valueDate:indexes.valueDate>=0&&clean(columns[indexes.valueDate])?date(columns[indexes.valueDate],`valueDate:${rowIndex}`):null,amount:amount(columns[indexes.amount]),currency:indexes.currency>=0?normalizeCurrency(columns[indexes.currency],defaultCurrency):defaultCurrency,reference:indexes.reference>=0?safeText(columns[indexes.reference],`reference:${rowIndex}`,240):null,memo:indexes.memo>=0?safeText(columns[indexes.memo],`memo:${rowIndex}`,1000):null,counterparty:indexes.counterparty>=0?safeText(columns[indexes.counterparty],`counterparty:${rowIndex}`,240):null,raw};});
  const currency=lines[0]?.currency||defaultCurrency;if(lines.some((line)=>line.currency!==currency))throw new HttpError(422,'El archivo mezcla monedas; importa cada moneda por separado.',{code:'BANK_STATEMENT_MIXED_CURRENCY'});return {format:'csv',parserName:'contagest-csv',parserVersion:BANK_STATEMENT_PARSER_VERSION,currency,openingBalance:null,closingBalance:null,lines};
}

const tag=(block:string,name:string)=>{const match=block.match(new RegExp(`<${name}>([^<\\r\\n]+)`,'i'));return match?clean(match[1]):'';};
function parseOfx(text:string,format:'ofx'|'qfx',defaultCurrency:string):ParsedStatement{
  const currency=normalizeCurrency(tag(text,'CURDEF')||defaultCurrency,defaultCurrency);const blocks=text.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi)||[];if(!blocks.length)throw new HttpError(422,'OFX/QFX sin STMTTRN.',{code:'BANK_STATEMENT_OFX_EMPTY'});
  const lines=blocks.map((block,index)=>({bankLineId:safeText(tag(block,'FITID'),`fitid:${index}`,240),bookedAt:date(tag(block,'DTPOSTED'),`dtposted:${index}`),valueDate:tag(block,'DTUSER')?date(tag(block,'DTUSER'),`dtuser:${index}`):null,amount:amount(tag(block,'TRNAMT')),currency,reference:safeText(tag(block,'CHECKNUM')||tag(block,'REFNUM'),`reference:${index}`,240),memo:safeText(tag(block,'MEMO')||tag(block,'NAME'),`memo:${index}`,1000),counterparty:safeText(tag(block,'NAME'),`counterparty:${index}`,240),raw:{fitid:tag(block,'FITID'),type:tag(block,'TRNTYPE'),memo:tag(block,'MEMO'),name:tag(block,'NAME')}}));
  return {format,parserName:'contagest-ofx',parserVersion:BANK_STATEMENT_PARSER_VERSION,currency,openingBalance:tag(text,'BALAMT')?amount(tag(text,'BALAMT')):null,closingBalance:tag(text,'BALAMT')?amount(tag(text,'BALAMT')):null,lines};
}

const xmlText=(block:string,name:string)=>{const pattern=name.includes(':')?name:name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const match=block.match(new RegExp(`<(?:\\w+:)?${pattern}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([^<\\]]+)`,'i'));return match?clean(match[1]):'';};
function parseCamt(text:string,defaultCurrency:string):ParsedStatement{
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new HttpError(422,'XML con DTD/ENTITY no permitido.',{code:'BANK_STATEMENT_XML_DTD_FORBIDDEN'});const entries=text.match(/<(?:\w+:)?Ntry(?:\s[^>]*)?>[\s\S]*?<\/(?:\w+:)?Ntry>/gi)||[];if(!entries.length)throw new HttpError(422,'CAMT sin Ntry.',{code:'BANK_STATEMENT_CAMT_EMPTY'});
  const lines=entries.map((block,index)=>{const amountValue=amount(xmlText(block,'Amt'));const indicator=xmlText(block,'CdtDbtInd').toUpperCase();const signed=indicator==='DBIT'&&money(amountValue).gt(0)?serializeDecimal(money(amountValue).negated(),2):amountValue;const currencyMatch=block.match(/<(?:\w+:)?Amt[^>]*\bCcy=["']([A-Za-z]{3,4})["']/i);const currency=normalizeCurrency(currencyMatch?.[1]||defaultCurrency,defaultCurrency);return {bankLineId:safeText(xmlText(block,'AcctSvcrRef')||xmlText(block,'NtryRef'),`id:${index}`,240),bookedAt:date(xmlText(block,'BookgDt')||xmlText(block,'Dt'),`booked:${index}`),valueDate:xmlText(block,'ValDt')?date(xmlText(block,'ValDt'),`value:${index}`):null,amount:signed,currency,reference:safeText(xmlText(block,'EndToEndId')||xmlText(block,'AcctSvcrRef'),`reference:${index}`,240),memo:safeText(xmlText(block,'AddtlNtryInf')||xmlText(block,'Ustrd'),`memo:${index}`,1000),counterparty:safeText(xmlText(block,'Nm'),`counterparty:${index}`,240),raw:{entryReference:xmlText(block,'NtryRef'),creditDebit:indicator}};});
  const currency=lines[0].currency;if(lines.some((line)=>line.currency!==currency))throw new HttpError(422,'CAMT mezcla monedas.',{code:'BANK_STATEMENT_MIXED_CURRENCY'});return {format:'camt',parserName:'contagest-camt',parserVersion:BANK_STATEMENT_PARSER_VERSION,currency,openingBalance:null,closingBalance:null,lines};
}

export function parseBankStatement(input:{fileName:string;mimeType?:string;bytes:Buffer;defaultCurrency:string}):ParsedStatement{
  if(!input.bytes?.length)throw new HttpError(422,'Extracto vacío.',{code:'BANK_STATEMENT_EMPTY_FILE'});if(input.bytes.length>MAX_STATEMENT_BYTES)throw new HttpError(413,'Extracto supera 5 MB.',{code:'BANK_STATEMENT_TOO_LARGE'});if(input.bytes.includes(0))throw new HttpError(422,'Archivo binario/corrupto no permitido.',{code:'BANK_STATEMENT_BINARY_REJECTED'});
  const text=input.bytes.toString('utf8');const ext=input.fileName.toLowerCase().split('.').pop()||'';if(ext==='csv')return parseCsv(text,normalizeCurrency(input.defaultCurrency));if(ext==='ofx'||ext==='qfx')return parseOfx(text,ext,normalizeCurrency(input.defaultCurrency));if(ext==='xml'||ext==='camt')return parseCamt(text,normalizeCurrency(input.defaultCurrency));throw new HttpError(415,'Formato no soportado. Usa CSV, OFX, QFX o CAMT XML.',{code:'BANK_STATEMENT_FORMAT_UNSUPPORTED'});
}
export function statementSourceHash(bytes:Buffer){return sha(bytes);}
export function statementLineHash(line:NormalizedStatementLine){return sha(JSON.stringify({bankLineId:line.bankLineId,bookedAt:line.bookedAt.toISOString(),amount:line.amount,currency:line.currency,reference:line.reference,memo:line.memo}));}
