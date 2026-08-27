import { BackendApi } from './backendApi.js';

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
const decoder=new TextDecoder('utf-8');

function parseDelimited(text, delimiter=',') {
  const records=[];let row=[];let cell='';let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    }else if(ch===delimiter&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);cell='';if(row.some((value)=>String(value).trim()!==''))records.push(row);row=[];
    }else cell+=ch;
  }
  if(cell||row.length){row.push(cell);if(row.some((value)=>String(value).trim()!==''))records.push(row);}
  const headers=(records.shift()||[]).map((value)=>String(value).replace(/^\uFEFF/,'').trim());
  return records.map((values)=>Object.fromEntries(headers.map((header,index)=>[header,String(values[index]??'').trim()])));
}

function u16(view,offset){return view.getUint16(offset,true);}
function u32(view,offset){return view.getUint32(offset,true);}

async function inflateRaw(bytes){
  if(typeof DecompressionStream==='undefined')throw new Error('Este navegador no soporta descompresión XLSX segura. Usa CSV/TSV/JSON o un navegador Chromium actualizado.');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipEntries(arrayBuffer){
  const bytes=new Uint8Array(arrayBuffer);const view=new DataView(arrayBuffer);let eocd=-1;
  for(let i=Math.max(0,bytes.length-65557);i<=bytes.length-22;i++)if(u32(view,i)===0x06054b50)eocd=i;
  if(eocd<0)throw new Error('XLSX inválido: no se encontró el directorio ZIP.');
  const entries=new Map();const count=u16(view,eocd+10);let offset=u32(view,eocd+16);
  for(let n=0;n<count;n++){
    if(u32(view,offset)!==0x02014b50)throw new Error('XLSX inválido: directorio ZIP corrupto.');
    const method=u16(view,offset+10);const compressed=u32(view,offset+20);const nameLength=u16(view,offset+28);const extraLength=u16(view,offset+30);const commentLength=u16(view,offset+32);const localOffset=u32(view,offset+42);
    const name=decoder.decode(bytes.slice(offset+46,offset+46+nameLength));
    if(u32(view,localOffset)!==0x04034b50)throw new Error('XLSX inválido: entrada ZIP corrupta.');
    const localNameLength=u16(view,localOffset+26);const localExtraLength=u16(view,localOffset+28);const start=localOffset+30+localNameLength+localExtraLength;const compressedBytes=bytes.slice(start,start+compressed);
    let content;if(method===0)content=compressedBytes;else if(method===8)content=await inflateRaw(compressedBytes);else throw new Error(`XLSX usa compresión ZIP no soportada (${method}).`);
    entries.set(name,decoder.decode(content));offset+=46+nameLength+extraLength+commentLength;
  }
  return entries;
}

const xml=(text)=>{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new Error('XLSX contiene XML inválido.');return doc;};
const lettersToIndex=(ref)=>{const letters=String(ref||'').match(/^[A-Z]+/i)?.[0]?.toUpperCase()||'A';let value=0;for(const char of letters)value=value*26+(char.charCodeAt(0)-64);return value-1;};

async function parseXlsx(file){
  const entries=await unzipEntries(await file.arrayBuffer());
  const sharedDoc=entries.has('xl/sharedStrings.xml')?xml(entries.get('xl/sharedStrings.xml')):null;
  const shared=sharedDoc?[...sharedDoc.querySelectorAll('si')].map((node)=>[...node.querySelectorAll('t')].map((t)=>t.textContent||'').join('')):[];
  let sheetPath='xl/worksheets/sheet1.xml';
  if(entries.has('xl/workbook.xml')&&entries.has('xl/_rels/workbook.xml.rels')){
    const workbook=xml(entries.get('xl/workbook.xml'));const rels=xml(entries.get('xl/_rels/workbook.xml.rels'));const first=workbook.querySelector('sheet');const relId=first?.getAttribute('r:id')||first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const relation=[...rels.querySelectorAll('Relationship')].find((node)=>node.getAttribute('Id')===relId);const target=relation?.getAttribute('Target');if(target)sheetPath=target.startsWith('/')?target.slice(1):`xl/${target.replace(/^\.\//,'')}`;
  }
  const sheetText=entries.get(sheetPath)||entries.get('xl/worksheets/sheet1.xml');if(!sheetText)throw new Error('XLSX no contiene una primera hoja legible.');
  const sheet=xml(sheetText);const matrix=[...sheet.querySelectorAll('sheetData > row')].map((row)=>{
    const values=[];for(const cell of row.querySelectorAll('c')){const index=lettersToIndex(cell.getAttribute('r'));const type=cell.getAttribute('t');let value='';if(type==='inlineStr')value=[...cell.querySelectorAll('is t')].map((t)=>t.textContent||'').join('');else{const raw=cell.querySelector('v')?.textContent||'';value=type==='s'?shared[Number(raw)]??'':type==='b'?(raw==='1'?'true':'false'):raw;}values[index]=value;}return values;
  }).filter((row)=>row.some((value)=>String(value??'').trim()!==''));
  const headers=(matrix.shift()||[]).map((value)=>String(value??'').trim());return matrix.map((row)=>Object.fromEntries(headers.map((header,index)=>[header,String(row[index]??'').trim()])));
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
      else rows=parseDelimited(text,name.endsWith('.tsv')||name.endsWith('.txt')?'\t':',');
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
