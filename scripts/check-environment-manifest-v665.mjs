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
 const entries=new Map(),duplicates=[];
 for(const raw of String(source).split(/\r?\n/)){
   const line=raw.trim();
   if(!line||line.startsWith('#'))continue;
   const m=/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
   if(!m)continue;
   const rawValue=m[2].trim();
   const quoted=/^(?:"([\s\S]*)"|'([\s\S]*)')(?:\s+#.*)?$/.exec(rawValue);
   const value=quoted?(quoted[1]??quoted[2]):rawValue.replace(/\s+#.*$/,'').trim();
   if(entries.has(m[1]))duplicates.push(m[1]);
   entries.set(m[1],value);
 }
 return{entries,duplicates};
}

export function checkEnvironmentManifest(samples,registry=CONFIG_MANIFEST_V665){
 const findings=[],add=(code,owner,key)=>findings.push({code,owner,key});
 for(const [owner,meta] of Object.entries(registry.surfaces)){
  const catalog=registry.variables[owner]||{};
  const parsed=meta.examplePath?parseTemplateInventory(samples[owner]??''):{entries:new Map(),duplicates:[]};
  for(const key of parsed.duplicates)add('DUPLICATE_SAMPLE_KEY',owner,key);
  for(const [key,record] of Object.entries(catalog)){
   if(!VALID_TYPES.has(record.type)||!VALID_VISIBILITY.has(record.visibility)||
      !VALID_REQUIRED.has(record.requiredWhen)||!VALID_SAMPLE.has(record.sample)||
      typeof record.sensitive!=='boolean')add('MANIFEST_INVALID_ENTRY',owner,key);
   if((owner==='frontend')!==(record.visibility==='public')||
      (owner==='build')!==(record.visibility==='build'))
     add('MANIFEST_VISIBILITY_MISMATCH',owner,key);
   if(owner==='frontend'&&record.sensitive)add('MANIFEST_PUBLIC_SECRET',owner,key);
   if(record.sample==='required'&&!parsed.entries.has(key))add('MANIFEST_MISSING_SAMPLE_KEY',owner,key);
   if(record.sample==='not-applicable'&&parsed.entries.has(key))add('MANIFEST_UNEXPECTED_SAMPLE',owner,key);
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
 return Object.fromEntries(Object.entries(CONFIG_MANIFEST_V665.surfaces)
  .filter(([,meta])=>meta.examplePath)
  .map(([owner,meta])=>[owner,readFileSync(resolve(repositoryRoot,meta.examplePath),'utf8')]));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=checkEnvironmentManifest(loadVersionedSamples());
 // Never print credentials or values.
 for(const f of report.findings)console.error(f.code+': '+f.owner+'/'+f.key);
 console.log('Config manifest #665: '+report.status+' ('+report.findings.length+' findings)');
 if(report.status!=='PASS')process.exitCode=1;
}
