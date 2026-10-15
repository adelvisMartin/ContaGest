import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CONFIG_MANIFEST_V665} from '../config/environment-manifest-v665.mjs';

const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const VALID_TYPES=new Set(['string','url','integer','number','boolean','enum','secret']);
const VALID_VISIBILITY=new Set(['public','server','build']);
const VALID_REQUIRED=new Set(['optional','production','lab-send','supabase-enabled']);
const VALID_SAMPLE=new Set(['required','optional','not-applicable']);

// Inspect only versioned examples; no access to OS or provider secrets.
export function parseTemplateInventory(source){
 const entries=new Map(),duplicates=[],invalidLines=[];
 for(const [index,raw] of String(source).split(/\r?\n/).entries()){
   const line=raw.trim();
   if(!line||line.startsWith('#'))continue;
   const m=/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
   if(!m){invalidLines.push(index+1);continue;}
   const rawValue=m[2].trim();
   const quoted=/^(?:"([\s\S]*)"|'([\s\S]*)')(?:\s+#.*)?$/.exec(rawValue);
   if((rawValue.startsWith('"')||rawValue.startsWith("'"))&&!quoted){
     invalidLines.push(index+1);continue;
   }
   const value=quoted?(quoted[1]??quoted[2]):rawValue.replace(/\s+#.*$/,'').trim();
   if(entries.has(m[1]))duplicates.push(m[1]);
   entries.set(m[1],value);
 }
 return{entries,duplicates,invalidLines};
}

const URL_SCHEMES=new Set(['http:','https:','postgres:','postgresql:','mysql:','mongodb:','mongodb+srv:','redis:','rediss:']);
function sampleMatchesDeclaredType(value,record,owner){
 // Empty string/URL/secret placeholders are intentional, but typed control
 // switches, counts and enums cannot silently become unset in required samples.
 if(value==='')return !['boolean','integer','number','enum'].includes(record.type);
 switch(record.type){
  case 'boolean':return value==='true'||value==='false';
  case 'integer':return /^(?:0|[1-9][0-9]*)$/.test(value)&&Number.isSafeInteger(Number(value));
  case 'number':return /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)&&Number.isFinite(Number(value));
  case 'enum':return Array.isArray(record.allowedValues)&&record.allowedValues.includes(value);
  case 'url':{
   // Relative URLs are explicitly authorized only by catalog metadata.
   // A backend/Bridge endpoint or Supabase public API may not silently
   // become a relative marketing route or a PostgreSQL connection string.
   if(record.allowRelative===true&&owner==='frontend'&&
      value.startsWith('/')&&!value.startsWith('//'))
     return !/[\s\\]/.test(value);
   const normalized=value.replace(/\[[A-Za-z0-9_-]+\]/g,'example');
   try{
     const url=new URL(normalized);
     return Array.isArray(record.allowedSchemes)&&record.allowedSchemes.includes(url.protocol)&&
       URL_SCHEMES.has(url.protocol)&&Boolean(url.hostname)&&
       (!['http:','https:'].includes(url.protocol)||(!url.username&&!url.password));
   }catch{return false;}
  }
  default:return true;
 }
}

// Mandatory owners and their versioned sample paths cannot be changed by
// removing a registry entry or pointing it to an absent file. This is an
// integrity check on inventory coverage, not a replacement runtime policy.
const REQUIRED_SURFACES=Object.freeze({
 backend:'backend/.env.example',
 frontend:'frontend/.env.example',
 bridge:'tools/hipico-whatsapp-web-bridge/.env.example',
 build:null
});

export function checkEnvironmentManifest(samples,registry=CONFIG_MANIFEST_V665){
 const findings=[],add=(code,owner,key)=>findings.push({code,owner,key});
 // Fail closed on a malformed manifest instead of throwing or treating a
 // missing public surface as if there were no frontend keys to inspect.
 if(!registry||typeof registry!=='object'||
    !registry.surfaces||typeof registry.surfaces!=='object'||Array.isArray(registry.surfaces)||
    !registry.variables||typeof registry.variables!=='object'||Array.isArray(registry.variables)){
   add('MANIFEST_STRUCTURE_INVALID','registry','surfaces/variables');
   return{status:'FAIL',findings};
 }
 for(const [owner,path] of Object.entries(REQUIRED_SURFACES)){
   const meta=Object.hasOwn(registry.surfaces,owner)?registry.surfaces[owner]:undefined;
   if(!meta||typeof meta!=='object'||Array.isArray(meta)||meta.examplePath!==path)
     add('MANIFEST_SURFACE_PATH_INVALID',owner,'examplePath');
   const registered=Object.hasOwn(registry.variables,owner)?registry.variables[owner]:undefined;
   if(!registered||typeof registered!=='object'||Array.isArray(registered)||
      Object.keys(registered).length===0)
     add('MANIFEST_SURFACE_CATALOG_MISSING',owner,'variables');
 }
 for(const owner of Object.keys(registry.surfaces))
   if(!Object.hasOwn(REQUIRED_SURFACES,owner))add('MANIFEST_UNKNOWN_SURFACE',owner,'surface');
 for(const owner of Object.keys(registry.variables))
   if(!Object.hasOwn(REQUIRED_SURFACES,owner))add('MANIFEST_UNKNOWN_SURFACE',owner,'variables');
 for(const [owner,meta] of Object.entries(registry.surfaces)){
  // Wrong-path surfaces are invalid regardless of the supplied sample text;
  // do not try to read a forged owner or enumerate an undefined catalog.
  if(!Object.hasOwn(REQUIRED_SURFACES,owner)||!meta||typeof meta!=='object'||Array.isArray(meta))
    continue;
  const catalog=registry.variables[owner];
  if(!catalog||typeof catalog!=='object'||Array.isArray(catalog))continue;
  const parsed=meta.examplePath?parseTemplateInventory(samples[owner]??''):{entries:new Map(),duplicates:[],invalidLines:[]};
  // Only line numbers may enter diagnostics; never echo malformed lines or values.
  for(const line of parsed.invalidLines)add('MANIFEST_INVALID_SAMPLE_LINE',owner,'line '+line);
  for(const key of parsed.duplicates)add('DUPLICATE_SAMPLE_KEY',owner,key);
  for(const [key,record] of Object.entries(catalog)){
   if(!VALID_TYPES.has(record.type)||!VALID_VISIBILITY.has(record.visibility)||
      !VALID_REQUIRED.has(record.requiredWhen)||!VALID_SAMPLE.has(record.sample)||
      typeof record.sensitive!=='boolean')add('MANIFEST_INVALID_ENTRY',owner,key);
   if((owner==='frontend')!==(record.visibility==='public')||
      (owner==='build')!==(record.visibility==='build'))
     add('MANIFEST_VISIBILITY_MISMATCH',owner,key);
   // Sensitive public types are rejected even if a flag was mislabeled.
   if(owner==='frontend'&&(record.sensitive||record.type==='secret'))
     add('MANIFEST_PUBLIC_SECRET',owner,key);
   if(record.sample==='required'&&!parsed.entries.has(key))add('MANIFEST_MISSING_SAMPLE_KEY',owner,key);
   if(record.sample==='not-applicable'&&parsed.entries.has(key))add('MANIFEST_UNEXPECTED_SAMPLE',owner,key);
   if(record.type==='enum'&&(
      !Array.isArray(record.allowedValues)||record.allowedValues.length===0||
      record.allowedValues.some(v=>typeof v!=='string'||!v)||
      new Set(record.allowedValues).size!==record.allowedValues.length))
     add('MANIFEST_ENUM_VALUES_INVALID',owner,key);
   // Protocol authority belongs to the manifest, never to a heuristic
   // that allows any URL scheme for all URL-typed fields.
   if(record.type==='url'&&(
      !Array.isArray(record.allowedSchemes)||record.allowedSchemes.length===0||
      record.allowedSchemes.some(v=>typeof v!=='string'||!URL_SCHEMES.has(v))||
      new Set(record.allowedSchemes).size!==record.allowedSchemes.length||
      (record.allowRelative!==undefined&&typeof record.allowRelative!=='boolean')||
      (record.allowRelative===true&&(owner!=='frontend'||key!=='VITE_MARKETING_DEMO_URL'))))
     add('MANIFEST_URL_POLICY_INVALID',owner,key);
   if(record.type!=='url'&&(record.allowedSchemes!==undefined||record.allowRelative!==undefined))
     add('MANIFEST_URL_POLICY_INVALID',owner,key);
   if(parsed.entries.has(key)&&!sampleMatchesDeclaredType(parsed.entries.get(key),record,owner))
     add('MANIFEST_SAMPLE_TYPE_INVALID',owner,key);
   if(record.safeSample!==undefined&&parsed.entries.has(key)&&parsed.entries.get(key)!==record.safeSample)
     add('MANIFEST_UNSAFE_DEFAULT',owner,key);
   if(record.aliasFor){
     const canonical=catalog[record.aliasFor];
     if(!canonical||canonical.aliasFor||record.aliasFor===key||!record.deprecation)
       add('MANIFEST_INVALID_ALIAS',owner,key);
     else if(parsed.entries.has(key)&&parsed.entries.has(record.aliasFor)){
       const old=parsed.entries.get(key),target=parsed.entries.get(record.aliasFor);
       if(old&&target&&old!==target)add('MANIFEST_ALIAS_DRIFT',owner,key);
     }
   }
  }
  for(const key of parsed.entries.keys())if(!catalog[key])add('MANIFEST_UNREGISTERED_KEY',owner,key);
 }
 return{status:findings.length?'FAIL':'PASS',findings};
}

export function loadVersionedSamples(){
 // A modified manifest must not redirect this loader to a private path.
 return Object.fromEntries(Object.entries(REQUIRED_SURFACES)
  .filter(([,path])=>path)
  .map(([owner,path])=>[owner,readFileSync(resolve(repositoryRoot,path),'utf8')]));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=checkEnvironmentManifest(loadVersionedSamples());
 // Never print credentials or values.
 for(const f of report.findings)console.error(f.code+': '+f.owner+'/'+f.key);
 console.log('Config manifest #665: '+report.status+' ('+report.findings.length+' findings)');
 if(report.status!=='PASS')process.exitCode=1;
}
