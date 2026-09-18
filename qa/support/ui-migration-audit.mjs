import fs from 'node:fs';
import path from 'node:path';
import {
  UI_MIGRATION_MANIFEST,
  UI_MIGRATION_ROUTES,
  UI_MIGRATION_STATUS
} from './ui-migration-manifest.mjs';

const normalize=(value)=>String(value||'').replaceAll('\\','/');

function readSource(root,relativePath,overrides={}){
  const key=normalize(relativePath);
  if(Object.prototype.hasOwnProperty.call(overrides,key))return String(overrides[key]);
  return fs.readFileSync(path.join(root,key),'utf8');
}

export function parsePageRegistry(source){
  const entries=new Map();
  const pattern=/(?:^|,)\s*(?:'([^']+)'|"([^"]+)"|([\w-]+))\s*:\s*\['\.\/pages\/([^']+)'\s*,\s*'([^']+)'\]/gm;
  for(const match of String(source).matchAll(pattern)){
    entries.set(match[1]||match[2]||match[3],{file:match[4],exportName:match[5]});
  }
  return entries;
}

export function extractResponsiveMediaBlocks(source){
  const css=String(source||'');
  const blocks=[];
  let cursor=0;
  while(cursor<css.length){
    const start=css.indexOf('@media',cursor);
    if(start<0)break;
    const open=css.indexOf('{',start);
    if(open<0)break;
    let depth=1;
    let index=open+1;
    while(index<css.length&&depth>0){
      if(css[index]==='{')depth+=1;
      else if(css[index]==='}')depth-=1;
      index+=1;
    }
    if(depth!==0)break;
    blocks.push({
      condition:css.slice(start+'@media'.length,open).trim(),
      body:css.slice(open+1,index-1)
    });
    cursor=index;
  }
  return blocks;
}

function sourceUsesClass(source,selector){
  const className=String(selector||'').replace(/^\./,'').split(/[\s>:+~.#\[]/,1)[0];
  return className&&String(source).includes(className);
}

function validateRegistry(entry,route,registry,errors){
  const actual=registry.get(route);
  if(!actual){
    errors.push(`${route}: registry entry missing`);
    return;
  }
  if(actual.file!==entry.registryFile||actual.exportName!==entry.exportName){
    errors.push(`${route}: registry drift expected ${entry.registryFile}#${entry.exportName} received ${actual.file}#${actual.exportName}`);
  }
}

function validateMigratedMui(root,route,entry,overrides,errors,details){
  if(!entry.owner)errors.push(`${route}: migrated owner missing`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.migratedAt||'')))errors.push(`${route}: migratedAt missing or invalid`);
  if(!Array.isArray(entry.sourceFiles)||entry.sourceFiles.length===0)errors.push(`${route}: sourceFiles missing`);
  for(const fileName of entry.sourceFiles||[]){
    const relative=`frontend/src/pages/${fileName}`;
    let source='';
    try{source=readSource(root,relative,overrides);}catch{errors.push(`${route}: source missing ${relative}`);continue;}
    for(const required of entry.requiredImports||[]){
      if(!source.includes(required))errors.push(`${route}: ${fileName} missing required MUI authority ${required}`);
    }
    for(const forbidden of entry.forbiddenImports||[]){
      if(source.includes(forbidden))errors.push(`${route}: legacy-kit import forbidden in ${fileName}: ${forbidden}`);
    }
    for(const token of entry.forbiddenTokens||[]){
      if(source.includes(token))errors.push(`${route}: forbidden legacy token in ${fileName}: ${token}`);
    }
  }
  details.framework='mui';
}

function validateLegacyException(root,route,entry,overrides,mediaBlocks,errors,details){
  for(const field of ['owner','approvedAt','followUp']){
    if(!String(entry[field]||'').trim())errors.push(`${route}: approved legacy exception missing ${field}`);
  }
  if(entry.approvedAt&&!/^\d{4}-\d{2}-\d{2}$/.test(entry.approvedAt))errors.push(`${route}: approvedAt invalid`);
  const relative=`frontend/src/pages/${entry.registryFile}`;
  let source='';
  try{source=readSource(root,relative,overrides);}catch{errors.push(`${route}: source missing ${relative}`);return;}
  if(entry.compatibilityImport&&!source.includes(entry.compatibilityImport)){
    errors.push(`${route}: approved legacy compatibility import missing; update manifest when migration completes`);
  }
  const markers=entry.responsiveMarkers||[];
  if(!markers.length)errors.push(`${route}: approved legacy exception missing responsiveMarkers`);
  for(const marker of markers){
    if(!sourceUsesClass(source,marker))errors.push(`${route}: responsive marker ${marker} not used by page`);
    const covered=mediaBlocks.some((block)=>/max-width/i.test(block.condition)&&block.body.includes(marker));
    if(!covered)errors.push(`${route}: responsive marker ${marker} has no max-width media contract`);
  }
  details.framework='legacy-compatible';
}

export function auditUiMigration(root=process.cwd(),{manifest=UI_MIGRATION_MANIFEST,overrides={}}={}){
  const errors=[];
  const registrySource=readSource(root,'frontend/src/data/pageRegistry.js',overrides);
  const registry=parsePageRegistry(registrySource);
  const css=readSource(root,'frontend/src/styles/module-adapters.css',overrides);
  const mediaBlocks=extractResponsiveMediaBlocks(css);
  const manifestRoutes=Object.keys(manifest).sort();
  const requiredRoutes=[...UI_MIGRATION_ROUTES].sort();

  for(const route of requiredRoutes)if(!manifest[route])errors.push(`${route}: migration manifest entry missing`);
  for(const route of manifestRoutes)if(!requiredRoutes.includes(route))errors.push(`${route}: unexpected migration manifest route`);

  const routes={};
  for(const route of requiredRoutes){
    const entry=manifest[route];
    if(!entry)continue;
    const routeErrors=[];
    validateRegistry(entry,route,registry,routeErrors);
    const details={status:entry.status,owner:entry.owner||null,registryFile:entry.registryFile,exportName:entry.exportName};
    if(entry.status===UI_MIGRATION_STATUS.MIGRATED_MUI)validateMigratedMui(root,route,entry,overrides,routeErrors,details);
    else if(entry.status===UI_MIGRATION_STATUS.LEGACY_EXCEPTION_APPROVED)validateLegacyException(root,route,entry,overrides,mediaBlocks,routeErrors,details);
    else routeErrors.push(`${route}: unknown migration status ${entry.status}`);
    errors.push(...routeErrors);
    routes[route]={...details,ok:routeErrors.length===0,errors:routeErrors};
  }

  const counts={
    migratedMui:requiredRoutes.filter((route)=>manifest[route]?.status===UI_MIGRATION_STATUS.MIGRATED_MUI).length,
    legacyExceptions:requiredRoutes.filter((route)=>manifest[route]?.status===UI_MIGRATION_STATUS.LEGACY_EXCEPTION_APPROVED).length
  };
  return {schemaVersion:1,ok:errors.length===0,counts,routes,errors};
}
