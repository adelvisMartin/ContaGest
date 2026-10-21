#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const canonical='frontend/src/components/vnext/index.js';
const ledgerPath='docs/architecture/component-library-vnext-v1.json';
const canonicalText=fs.readFileSync(path.join(root,canonical),'utf8');
const ledger=JSON.parse(fs.readFileSync(path.join(root,ledgerPath),'utf8'));
const required=['CgButton','CgIconButton','CgTextField','CgTextarea','CgPageHeader','CgSection','CgStatusChip','CgBadge','CgMoney','CgLoadingState','CgEmptyState','CgErrorState','CgPermissionState'];

// State primitives are defined once in states.js and explicitly re-exported
// by the canonical index. Checking only direct declarations rejects that valid
// API and hides a missing source export behind a brittle text search.
const stateSource=fs.readFileSync(path.join(root,'frontend/src/components/vnext/states.js'),'utf8');
const stateExports=canonicalText.match(/export\s*\{([^}]+)\}\s*from\s*['"]\.\/states\.js['"]/m)?.[1]||'';
const reexportedNames=new Set(stateExports.split(',').map((name)=>name.trim()));
for(const name of required){
  const direct=new RegExp('export (?:function|const) '+name+'\\b').test(canonicalText);
  const imported=reexportedNames.has(name) &&
    new RegExp('export (?:function|const) '+name+'\\b').test(stateSource);
  if(!direct&&!imported) throw new Error('MISSING_CANONICAL_COMPONENT:'+name);
}
if(ledger.canonicalOwner!==canonical) throw new Error('INVALID_COMPONENT_LIBRARY_OWNER');
if(ledger.themeOwner!=='frontend/src/design-system/semanticTokens.v1.js') throw new Error('INVALID_THEME_OWNER');
if(!ledger.deprecatedOwners?.some((row)=>row.owner==='frontend/src/components/ui/kit.js'&&row.status==='deprecated-transition')) throw new Error('MISSING_LEGACY_DEPRECATION');

const competing=[];
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()){ if(!['node_modules','dist','.git'].includes(entry.name)) walk(full); continue; }
    if(!/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    const rel=path.relative(root,full).replaceAll('\\','/');
    if(rel===canonical||rel==='frontend/src/components/muiThemeAdapter.js') continue;
    const text=fs.readFileSync(full,'utf8');
    if(/\bcreateTheme\s*\(/.test(text)) competing.push(`${rel}:createTheme`);
  }
}
walk(path.join(root,'frontend/src'));
if(competing.length) throw new Error(`COMPETING_THEME_OWNER:${competing.join(',')}`);

console.log(JSON.stringify({ok:true,owner:canonical,required:required.length,legacyOwner:'deprecated-transition'}));
