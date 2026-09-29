#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { renderContaGestCss, renderHipicoCss } from './generate-design-tokens-v631.mjs';

const read=(file)=>fs.readFileSync(file,'utf8');
const fail=(message)=>{console.error('[design-system-authority][FAIL] '+message);process.exitCode=1;};
const walk=(root)=>{
  if(!fs.existsSync(root))return [];
  return fs.readdirSync(root,{withFileTypes:true}).flatMap((entry)=>{
    const file=path.join(root,entry.name);
    return entry.isDirectory()?walk(file):[file];
  });
};

const files={
  canonical:'frontend/src/design-system/semanticTokens.v1.js',
  facade:'frontend/src/components/designSystem.js',
  compatibility:'frontend/src/components/designTokens.js',
  kit:'frontend/src/components/ui/kit.js',
  index:'frontend/src/components/ui/index.js',
  muiRuntime:'frontend/src/components/muiRuntime.js',
  muiAdapter:'frontend/src/components/muiThemeAdapter.js',
  mainCss:'frontend/public/design-system/contagest-semantic-tokens-v1.css',
  hipicoCss:'frontend/public/hipico-control/assets/css/platform-tokens-v1.css',
  mainIndex:'frontend/index.html',
  hipicoIndex:'frontend/public/hipico-control/index.html',
  legacyCss:'frontend/src/styles/contagest-visual-system-v12.css',
  hipicoLegacyCss:'frontend/public/hipico-control/assets/css/app.css',
  ledger:'docs/architecture/design-token-authority-v1.json'
};
for(const file of Object.values(files))if(!fs.existsSync(file))fail('missing authority file: '+file);
if(process.exitCode)process.exit(process.exitCode);

const canonical=read(files.canonical),facade=read(files.facade),compatibility=read(files.compatibility),kit=read(files.kit),index=read(files.index),muiRuntime=read(files.muiRuntime),muiAdapter=read(files.muiAdapter),mainCss=read(files.mainCss),hipicoCss=read(files.hipicoCss),mainIndex=read(files.mainIndex),hipicoIndex=read(files.hipicoIndex);
const ledger=JSON.parse(read(files.ledger));

if(!canonical.includes("contract: 'contagest-semantic-design-tokens'"))fail('canonical semantic token contract missing');
if(!facade.includes("from './ui/kit.js'"))fail('legacy facade must delegate to ./ui/kit.js');
if(!/export\s+\*\s+from\s+['"]\.\/kit\.js['"]/.test(index))fail('ui/index.js must re-export the canonical kit');
if(!/export\s+(const|function)\s+Button\b/.test(kit)||!/export\s+(const|function)\s+PageHeader\b/.test(kit))fail('canonical kit exports missing');
if(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(compatibility))fail('designTokens.js must remain value-free');
if(!compatibility.includes('semanticTokens.v1.js'))fail('compatibility facade must document canonical source');
if(!muiRuntime.includes("from './muiThemeAdapter.js'"))fail('muiRuntime must delegate theme creation');
if(/#[0-9a-f]{3,8}\b/i.test(muiRuntime)||/#[0-9a-f]{3,8}\b/i.test(muiAdapter))fail('MUI runtime/adapter must not own a color palette');
if(!muiAdapter.includes('semanticTokens.v1.js')||!muiAdapter.includes('getContaGestThemeTokens'))fail('MUI adapter must consume canonical semantic tokens');
if(mainCss!==renderContaGestCss())fail('generated ContaGest CSS adapter is stale');
if(hipicoCss!==renderHipicoCss())fail('generated Hípico CSS adapter is stale');
if(!mainIndex.includes('./design-system/contagest-semantic-tokens-v1.css'))fail('main entrypoint does not load generated adapter');
const legacyOrder=hipicoIndex.indexOf('./assets/css/app.css'),adapterOrder=hipicoIndex.indexOf('./assets/css/platform-tokens-v1.css');
if(legacyOrder<0||adapterOrder<legacyOrder)fail('Hípico adapter must load after transitional app.css');
if(ledger.canonicalSource!==files.canonical)fail('deprecation ledger canonical source mismatch');
for(const item of ledger.mappings||[]){
  if(item.status==='deprecated-fallback'&&(!item.owner||!item.reason||!/^\d{4}-\d{2}-\d{2}$/.test(item.reviewBy||'')||!item.removalCriteria))fail('invalid deprecated fallback ledger entry: '+String(item.legacyOwner));
}

const allowedCgOwners=new Set([path.normalize(files.mainCss),path.normalize(files.legacyCss)]);
for(const file of walk('frontend').filter((name)=>name.endsWith('.css'))){
  const source=read(file);
  if(/--cg-v-[a-z0-9-]+\s*:/i.test(source)&&!allowedCgOwners.has(path.normalize(file)))fail('competing --cg-v-* owner: '+file);
}
const allowedHipicoOwners=new Set([path.normalize(files.hipicoCss),path.normalize(files.hipicoLegacyCss)]);
for(const file of walk('frontend/public/hipico-control').filter((name)=>name.endsWith('.css'))){
  const source=read(file);
  if(/--hc-[a-z0-9-]+\s*:/i.test(source)&&!allowedHipicoOwners.has(path.normalize(file)))fail('competing --hc-* owner: '+file);
}
for(const file of walk('frontend/src').filter((name)=>/\.[cm]?[jt]sx?$/.test(name))){
  if(file.endsWith(path.normalize('muiThemeAdapter.js')))continue;
  if(/\bcreateTheme\s*\(/.test(read(file)))fail('competing MUI theme owner: '+file);
}

const tokenRefs=[...compatibility.matchAll(/var\((--cg-v-[a-z0-9-]+)\)/gi)].map((match)=>match[1]);
if(!tokenRefs.length)fail('compatibility facade must reference --cg-v-* variables');
for(const token of new Set(tokenRefs))if(!mainCss.includes(token+':'))fail('compatibility variable missing from generated adapter: '+token);

if(!process.exitCode)console.log(`[design-system-authority][PASS] canonical=${files.canonical} tokenRefs=${new Set(tokenRefs).size} generated=2`);
