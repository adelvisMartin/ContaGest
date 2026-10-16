/** #770 Import preview only. Tenant/permissions, persistence and audit remain server-owned. */
import {createHash} from 'node:crypto';
const SCHEMAS=Object.freeze({
  clients:Object.freeze(['rif','name','email']),
  suppliers:Object.freeze(['rif','name','email']),
  products:Object.freeze(['sku','name','unit'])
});
export function preflightMasterCsv({kind,csv,tenantId}={}){
  if(!Object.hasOwn(SCHEMAS,kind)||typeof tenantId!=='string'||!/^\w[\w:-]{0,99}$/.test(tenantId)||
     typeof csv!=='string'||Buffer.byteLength(csv,'utf8')>1024*1024||csv.length===0)throw new Error('IMPORT_SCOPE_OR_SIZE_INVALID');
  const raw=csv.charCodeAt(0)===0xfeff?csv.slice(1):csv;
  let records=[],record=[],field='',quoted=false,finishedQuote=false;
  for(let i=0;i<raw.length;i++){
    const c=raw[i];
    if(quoted){if(c==='"'&&raw[i+1]==='"'){field+='"';i++;}else if(c==='"'){quoted=false;finishedQuote=true;}else{field+=c;}}
    else if(finishedQuote){if(c===','){record.push(field);field='';finishedQuote=false;}
      else if(c==='\n'||(c==='\r'&&raw[i+1]==='\n')){record.push(field);records.push(record);record=[];field='';finishedQuote=false;if(c==='\r')i++;}
      else throw new Error('IMPORT_CSV_MALFORMED');}
    else if(c==='"'){if(field!=='')throw new Error('IMPORT_CSV_MALFORMED');quoted=true;}
    else if(c===','){record.push(field);field='';}
    else if(c==='\n'||(c==='\r'&&raw[i+1]==='\n')){record.push(field);records.push(record);record=[];field='';if(c==='\r')i++;}
    else if(c==='\r'||c==='\0'){throw new Error('IMPORT_CSV_MALFORMED');}
    else field+=c;
    if(field.length>8192||records.length>2000)throw new Error('IMPORT_CSV_BOUNDS');
  }
  if(quoted)throw new Error('IMPORT_CSV_MALFORMED');
  if(finishedQuote||field!==''||record.length){record.push(field);records.push(record);}
  const expected=SCHEMAS[kind],head=records.shift();
  if(!head||head.length!==expected.length||!head.every((s,i)=>s===expected[i]))throw new Error('IMPORT_HEADER_NOT_ALLOWED');
  if(records.length===0||records.length>2000)throw new Error('IMPORT_CSV_BOUNDS');
  const errors=[],keySet=new Set();let accepted=0;
  for(let i=0;i<records.length;i++){
    const row=records[i];let reason=null;
    if(row.length!==expected.length) reason='COLUMN_COUNT';
    else if(row.some(v=>v.length>512||/[\u0000-\u001f\u007f]/.test(v)||/^[\s]*[=+@]/.test(v)))reason='UNSAFE_CELL';
    else if(!row[0]?.trim()||!row[1]?.trim())reason='REQUIRED_FIELD';
    else{
      const key=row[0].trim().toUpperCase();
      if(keySet.has(key))reason='DUPLICATE_KEY';
      keySet.add(key);
    }
    if(reason)errors.push(Object.freeze({row:i+2,code:reason}));else accepted++;
  }
  return Object.freeze({kind,tenantId,fileSha256:createHash('sha256').update(csv,'utf8').digest('hex'),
    rows:records.length,accepted,rejected:errors.length,errors:Object.freeze(errors),
    canCommit:false,requiresServerTenantValidation:true,requiresAuditedTransaction:true});
}
