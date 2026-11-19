import { BackendApi } from './backendApi.js';
import { assertXlsxZipBudget, assertXlsxZipEntryName, assertSafeImportXml } from './xlsxZipBudget.mjs';
import { parseDelimitedImport } from './delimitedImportParser.mjs';
import { xlsxColumnIndex, assertXlsxHeaders, assertXlsxImportRowCount, assertXlsxCellValue, assertXlsxWorksheetTarget, isXlsxPreviewXmlPart, xlsxSharedString } from './xlsxImportGuards.mjs';

export const IMPORT_TEMPLATE_VERSION='v1';
export const IMPORT_TEMPLATES = {
  inventory: ['sku','name','category','min','costUsd','priceUsd','barcode'],
  clients: ['name','rif','email','phone','type','address'],
  suppliers: ['name','rif','email','phone','category','address'],
  accounts: ['code','name','type','nature','level','parentCode','allowPosting'],
  payroll: ['employee','idNumber','position','department','hiredAt','salary']
};
export const IMPORT_REQUIRED = {
  inventory:['sku','name'], clients:['name','rif'], suppliers:['name','rif'], accounts:['code','name','type','nature'], payroll:['employee','idNumber']
};

const MAX_FILE_BYTES=5*1024*1024;
const DELIMITED_FILE_ERRORS = Object.freeze({
  IMPORT_DELIMITED_INPUT_INVALID: 'Formato CSV/TSV no admitido.',
  IMPORT_DELIMITED_TOO_MANY_COLUMNS: 'El archivo supera el máximo de 128 columnas.',
  IMPORT_DELIMITED_TOO_MANY_ROWS: 'El archivo supera el máximo de 5.000 filas.',
  IMPORT_DELIMITED_CELL_TOO_LONG: 'Una celda supera el máximo de 8.192 caracteres.',
  IMPORT_DELIMITED_MALFORMED_QUOTES: 'El archivo tiene comillas incompletas o incorrectamente escapadas.',
  IMPORT_DELIMITED_HEADERS_INVALID: 'Los encabezados están vacíos, duplicados o son inválidos.',
  IMPORT_DELIMITED_COLUMN_COUNT: 'Una fila tiene una cantidad de columnas diferente a los encabezados.'
});
const decoder=new TextDecoder('utf-8',{fatal:true});

function u16(view,offset){return view.getUint16(offset,true);}
function u32(view,offset){return view.getUint32(offset,true);}

async function inflateRaw(bytes,maxBytes){
  if(typeof DecompressionStream==='undefined')throw new Error('Este navegador no soporta descompresión XLSX segura. Usa CSV/TSV/JSON o un navegador Chromium actualizado.');
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks=[];let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>maxBytes)throw new Error('XLSX excede los límites seguros de descompresión.');
      chunks.push(value);
    }
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  const output=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength;}
  return output;
}

async function unzipEntries(arrayBuffer){
  const bytes=new Uint8Array(arrayBuffer);const view=new DataView(arrayBuffer);let eocd=-1;
  for(let i=Math.max(0,bytes.length-65557);i<=bytes.length-22;i++)if(u32(view,i)===0x06054b50)eocd=i;
  if(eocd<0)throw new Error('XLSX inválido: no se encontró el directorio ZIP.');
  const entries=new Map();const count=u16(view,eocd+10);let offset=u32(view,eocd+16);let expanded=0;
  if(count>1024)throw new Error('XLSX contiene demasiadas entradas ZIP.');
  for(let n=0;n<count;n++){
    if(offset+46>bytes.length||u32(view,offset)!==0x02014b50)throw new Error('XLSX inválido: directorio ZIP corrupto.');
    const method=u16(view,offset+10);const compressed=u32(view,offset+20);const uncompressed=u32(view,offset+24);
    const nameLength=u16(view,offset+28);const extraLength=u16(view,offset+30);const commentLength=u16(view,offset+32);const localOffset=u32(view,offset+42);
    if(offset+46+nameLength+extraLength+commentLength>eocd)throw new Error('XLSX inválido: directorio ZIP incompleto.');
    const name=assertXlsxZipEntryName(decoder.decode(bytes.slice(offset+46,offset+46+nameLength)));
    expanded=assertXlsxZipBudget({count,compressed,uncompressed,total:expanded});
    if(entries.has(name))throw new Error('XLSX contiene rutas ZIP duplicadas.');
    if(localOffset+30>bytes.length||u32(view,localOffset)!==0x04034b50)throw new Error('XLSX inválido: entrada ZIP corrupta.');
    const flags=u16(view,offset+8);
    if((flags&1)!==0||u16(view,localOffset+6)!==flags||u16(view,localOffset+8)!==method)
      throw new Error('XLSX inválido: ZIP cifrado o metadatos locales incoherentes.');
    const localNameLength=u16(view,localOffset+26);const localExtraLength=u16(view,localOffset+28);const start=localOffset+30+localNameLength+localExtraLength;
    if(start>eocd||start+compressed>eocd||
       decoder.decode(bytes.slice(localOffset+30,localOffset+30+localNameLength))!==name)
      throw new Error('XLSX inválido: ruta o datos ZIP incoherentes.');
    const compressedBytes=bytes.slice(start,start+compressed);
    let content;if(method===0)content=compressedBytes;else if(method===8)content=await inflateRaw(compressedBytes,uncompressed);else throw new Error(`XLSX usa compresión ZIP no soportada (${method}).`);
    if(content.byteLength!==uncompressed)throw new Error('XLSX inválido: longitud descomprimida inconsistente.');
    // Binary media is valid in XLSX, but must never enter strict UTF-8/XML parsing.
    if(isXlsxPreviewXmlPart(name))entries.set(name,decoder.decode(content));
    offset+=46+nameLength+extraLength+commentLength;
  }
  return entries;
}

const xml=(text)=>{const doc=new DOMParser().parseFromString(assertSafeImportXml(text),'application/xml');if(doc.querySelector('parsererror'))throw new Error('XLSX contiene XML inválido.');return doc;};

async function parseXlsx(file){
  const entries=await unzipEntries(await file.arrayBuffer());
  const sharedDoc=entries.has('xl/sharedStrings.xml')?xml(entries.get('xl/sharedStrings.xml')):null;
  const shared=sharedDoc?[...sharedDoc.querySelectorAll('si')].map((node)=>[...node.querySelectorAll('t')].map((t)=>t.textContent||'').join('')):[];
  let sheetPath='xl/worksheets/sheet1.xml';
  if(entries.has('xl/workbook.xml')!==entries.has('xl/_rels/workbook.xml.rels'))
    throw new Error('XLSX sin relaciones completas del libro.');
  if(entries.has('xl/workbook.xml')&&entries.has('xl/_rels/workbook.xml.rels')){
    const workbook=xml(entries.get('xl/workbook.xml'));const rels=xml(entries.get('xl/_rels/workbook.xml.rels'));const first=workbook.querySelector('sheet');const relId=first?.getAttribute('r:id')||first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const relation=[...rels.querySelectorAll('Relationship')].find((node)=>node.getAttribute('Id')===relId);
    if(!relation||relation.getAttribute('TargetMode')==='External')throw new Error('XLSX con hoja externa o sin relación válida.');
    sheetPath=assertXlsxWorksheetTarget(relation.getAttribute('Target'));
  }
  const sheetText=entries.get(sheetPath);if(!sheetText)throw new Error('XLSX no contiene la primera hoja referenciada por el libro.');
  const sheet=xml(sheetText);
  const sheetRows=[...sheet.querySelectorAll('sheetData > row')];
  assertXlsxImportRowCount(sheetRows.length);
  const matrix=sheetRows.map((row)=>{
    const cells=row.querySelectorAll('c');
    if(cells.length>128)throw new Error('XLSX supera el máximo de 128 columnas por fila.');
    const values=[];const seen=new Set();
    for(const cell of cells){
      const index=xlsxColumnIndex(cell.getAttribute('r'));
      if(seen.has(index))throw new Error('XLSX contiene referencias de celda duplicadas.');
      seen.add(index);
      if(cell.querySelector('f'))throw new Error('XLSX contiene fórmulas; convierte las celdas a valores antes de importar.');
      const type=cell.getAttribute('t');let value='';
      if(type==='inlineStr')value=[...cell.querySelectorAll('is t')].map(t=>t.textContent||'').join('');
      else{
        const raw=cell.querySelector('v')?.textContent||'';
        value=type==='s'?xlsxSharedString(raw,shared):type==='b'?(raw==='1'?'true':'false'):raw;
      }
      values[index]=assertXlsxCellValue(value);
    }
    return values;
  }).filter(row=>row.some(value=>String(value??'').trim()!==''));
  const headers=assertXlsxHeaders(matrix.shift()||[]);
  return matrix.map(row=>{
    if(row.some((value,index)=>index>=headers.length&&String(value??'').trim()!==''))
      throw new Error('XLSX contiene datos fuera de las columnas declaradas.');
    return Object.fromEntries(headers.map((header,index)=>[header,String(row[index]??'').trim()]));
  });
}

function normalizeRecord(record, type) {
  const aliases={inventory:{cost:'costUsd',price:'priceUsd',minStock:'min'},payroll:{fullName:'employee'}};
  for(const [source,target] of Object.entries(aliases[type]||{}))if(record[target]===undefined&&record[source]!==undefined)record[target]=record[source];
  return record;
}

export const DataImportService = {
  async parseFile(file, type) {
    if(Number(file.size||0)>MAX_FILE_BYTES)throw new Error('El archivo supera el límite de 5 MB.');
    const name=file.name.toLowerCase();let rows=[];
    if(name.endsWith('.xlsx'))rows=await parseXlsx(file);
    else{
      const text=await file.text();
      if(name.endsWith('.json'))rows=JSON.parse(text);
      else{
        try{rows=parseDelimitedImport(text,name.endsWith('.tsv')||name.endsWith('.txt')?'\t':',');}
        catch(error){
          const message=DELIMITED_FILE_ERRORS[error?.message];
          if(!message)throw error;
          const displayError=new Error(message);
          displayError.code=error.message;
          throw displayError;
        }
      }
    }
    if(!Array.isArray(rows))throw new Error('El archivo debe contener una lista de registros.');
    if(rows.length>5000)throw new Error('La importación admite un máximo de 5.000 filas por batch.');
    return rows.map((r)=>normalizeRecord({...r},type));
  },
  validateRows(rows, type) {
    const required=IMPORT_REQUIRED[type]||[];
    return rows.map((row,index)=>{const missing=required.filter((field)=>row[field]===undefined||String(row[field]).trim()==='');return{index:index+1,ok:missing.length===0,missing,row};});
  },
  buildTemplateCsv(type) {return (IMPORT_TEMPLATES[type]||[]).join(',')+'\n';},
  preview({type,rows,filename,duplicatePolicy='error'}) {return BackendApi.post('/imports/preview',{type,rows,filename,templateVersion:IMPORT_TEMPLATE_VERSION,duplicatePolicy});},
  getBatch(id){return BackendApi.get(`/imports/${encodeURIComponent(id)}`);},
  listBatches(){return BackendApi.get('/imports');},
  commit(batch){return BackendApi.request(`/imports/${encodeURIComponent(batch.id)}/commit`,{method:'POST',headers:{'Idempotency-Key':`cg-import-${batch.id}`},body:{confirm:true,checksum:batch.checksum}});},
  report(id){return BackendApi.get(`/imports/${encodeURIComponent(id)}/report`);}
};
