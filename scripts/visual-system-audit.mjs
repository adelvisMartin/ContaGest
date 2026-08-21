import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MODULE_VISUAL_CATALOG } from '../qa/support/module-visual-catalog.mjs';

const root=process.cwd();
const strict=process.argv.includes('--strict');
const outDir=path.join(root,'artifacts','qa');
const stylesDir=path.join(root,'frontend','src','styles');
const runtimeFile=path.join(stylesDir,'erp-runtime.css');
const rel=(file)=>path.relative(root,file).replaceAll('\\','/');
const read=(file)=>fs.readFileSync(file,'utf8');
const exists=(file)=>fs.existsSync(file);
const hash=(value)=>crypto.createHash('sha256').update(value).digest('hex');
const count=(source,regex)=>[...String(source).matchAll(regex)].length;
const normalizeSpace=(value)=>String(value||'').replace(/\s+/g,' ').trim();
const escapeCell=(value)=>String(value??'').replaceAll('|','\\|').replaceAll('\n',' ');

const CANONICAL_STYLE_FILES=new Set([
  'contagest-visual-system-v12.css',
  'erp-runtime.css',
  'module-adapters.css',
  'runtime-primitives-v13.css',
  'shell-contract.css',
  'shell-stability-v1127.css'
]);
const ALLOWED_RUNTIME_IMPORTS=new Set([
  './shell-contract.css',
  './shell-stability-v1127.css',
  './runtime-primitives-v13.css',
  './module-adapters.css',
  './contagest-visual-system-v12.css'
]);
const RETIRED_THEME_NAMES=['sector','enterprise','executive','finance','sky','soft-blue','spectrum','ocean','forest','celestial'];

function walk(dir,predicate=()=>true){
  if(!exists(dir))return[];
  const files=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const target=path.join(dir,entry.name);
    if(entry.isDirectory())files.push(...walk(target,predicate));
    else if(predicate(target))files.push(target);
  }
  return files;
}

function extractPageRegistry(){
  const source=read(path.join(root,'frontend','src','app.js'));
  const start=source.indexOf('const pageRegistry={');
  const end=source.indexOf('\n};',start);
  if(start<0||end<0)throw new Error('No se pudo leer pageRegistry en frontend/src/app.js');
  const block=source.slice(start,end+3);
  const entries=[];
  const pattern=/(?:^|,)\s*(?:'([^']+)'|"([^"]+)"|([\w-]+))\s*:\s*\['\.\/pages\/([^']+)'\s*,\s*'([^']+)'\]/gm;
  for(const match of block.matchAll(pattern))entries.push({route:match[1]||match[2]||match[3],file:match[4],exportName:match[5]});
  return entries;
}

function stripPrintOnlyStyles(source){
  return String(source).replace(/<style\b[^>]*data-cg-print-only[^>]*>[\s\S]*?<\/style>/gi,'');
}

function auditPage(entry){
  const file=path.join(root,'frontend','src','pages',entry.file);
  const catalog=MODULE_VISUAL_CATALOG.find((item)=>item.route===entry.route);
  if(!exists(file))return{...entry,family:catalog?.family||'other',priority:catalog?.priority||'high',exists:false,score:0,findings:[{severity:'critical',code:'missing-page',detail:`No existe ${rel(file)}`}]};
  const source=read(file);
  const runtimeSource=stripPrintOnlyStyles(source);
  const findings=[];
  const add=(severity,code,detail)=>findings.push({severity,code,detail});
  const kit=/components\/ui\/index\.js/.test(source);
  const legacyDs=/components\/designSystem\.js/.test(source);
  const printOnlyStyleBlocks=count(source,/<style\b[^>]*data-cg-print-only[^>]*>/gi);
  const styleBlocks=count(runtimeSource,/<style\b/gi);
  const inlineStyles=count(runtimeSource,/\bstyle\s*=\s*["'`]/g);
  const localCssImports=count(source,/import\s+[^;]*['"][^'"]*styles\//g);
  const rawTables=count(runtimeSource,/<table\b/gi);
  const rawForms=count(runtimeSource,/<form\b/gi);
  const rawControls=count(runtimeSource,/<(?:input|select|textarea)\b/gi);
  const rawButtons=count(runtimeSource,/<button\b/gi);
  const hardFont=count(runtimeSource,/font-size\s*:\s*(?:clamp\([^)]*\)|\d+(?:\.\d+)?(?:px|rem))/gi);
  const hardWidth=count(runtimeSource,/(?:min-|max-)?width\s*:\s*\d{2,}(?:px|rem)/gi);
  const hardColor=count(runtimeSource,/#[0-9a-f]{3,8}\b/gi);
  const absolute=count(runtimeSource,/position\s*:\s*(?:absolute|fixed)/gi);
  const materialSymbols=count(runtimeSource,/material-symbols|material-icons/gi);
  if(styleBlocks)add('critical','runtime-style-block',`${styleBlocks} bloque(s) <style> afectan la UI runtime.`);
  if(localCssImports)add('critical','page-css-import',`${localCssImports} import(s) CSS desde la página; sólo erp-runtime.css puede poseer la cascada.`);
  if(inlineStyles)add('medium','inline-style',`${inlineStyles} style= inline; migrar al contrato compartido.`);
  if(hardFont)add('medium','hardcoded-font-size',`${hardFont} tamaño(s) definidos en markup/runtime.`);
  if(hardWidth)add('medium','fixed-width',`${hardWidth} ancho(s) rígido(s) definidos en markup/runtime.`);
  if(hardColor)add('medium','hardcoded-color',`${hardColor} color(es) hex definidos en la vista.`);
  if(absolute)add('medium','absolute-layout',`${absolute} layout(s) absolute/fixed; revisar ownership.`);
  if(legacyDs)add('medium','legacy-design-system','Importa designSystem.js; migrar al kit canónico cuando se edite la vista.`');
  if(!kit&&(rawForms||rawTables||rawButtons||rawControls))add('medium','kit-adoption',`UI operativa sin import directo del kit (forms:${rawForms}, tables:${rawTables}, controls:${rawControls}, buttons:${rawButtons}).`);
  if(materialSymbols)add('low','icon-family',`${materialSymbols} referencia(s) Material Icons/Symbols; Font Awesome es la familia vanilla canónica.`);
  const weights={critical:30,high:16,medium:6,low:2};
  return{...entry,family:catalog?.family||'other',priority:catalog?.priority||'medium',exists:true,path:rel(file),bytes:Buffer.byteLength(source),score:Math.max(0,100-findings.reduce((sum,item)=>sum+(weights[item.severity]||0),0)),kit,metrics:{printOnlyStyleBlocks,styleBlocks,inlineStyles,localCssImports,rawTables,rawForms,rawControls,rawButtons,hardFont,hardWidth,hardColor,absolute,materialSymbols},findings};
}

function cssImports(file){
  const imports=[];
  for(const match of read(file).matchAll(/@import\s+(?:url\()?['"]([^'"]+\.css)['"]/g)){
    if(/^(?:https?:)?\/\//.test(match[1]))continue;
    imports.push(match[1]);
  }
  return imports;
}

function activeCssGraph(entry){
  const visited=new Set();
  const visit=(file)=>{
    const absolute=path.resolve(file);
    if(visited.has(absolute)||!exists(absolute))return;
    visited.add(absolute);
    for(const imported of cssImports(absolute))visit(path.resolve(path.dirname(absolute),imported));
  };
  visit(entry);
  return[...visited];
}

function extractSelectors(source){
  const clean=String(source).replace(/\/\*[\s\S]*?\*\//g,'');
  const selectors=[];
  for(const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    const raw=normalizeSpace(match[1]);
    if(!raw||raw.startsWith('@')||raw.includes('from ')||raw.includes('to '))continue;
    for(const selector of raw.split(',').map(normalizeSpace).filter(Boolean))if(selector.length<=260)selectors.push(selector);
  }
  return selectors;
}

function auditCss(){
  const allCss=walk(stylesDir,(file)=>file.endsWith('.css'));
  const active=activeCssGraph(runtimeFile);
  const activeSet=new Set(active.map(path.resolve));
  const runtimeImports=cssImports(runtimeFile);
  const forbiddenRuntimeImports=runtimeImports.filter((item)=>!ALLOWED_RUNTIME_IMPORTS.has(item));
  const missingRuntimeImports=[...ALLOWED_RUNTIME_IMPORTS].filter((item)=>!runtimeImports.includes(item));
  const unexpectedCss=allCss.filter((file)=>!CANONICAL_STYLE_FILES.has(path.basename(file))).map(rel);
  const missingCanonical=[...CANONICAL_STYLE_FILES].filter((name)=>!exists(path.join(stylesDir,name)));
  const legacyDirectory=path.join(stylesDir,'legacy');
  const legacyDirectoryFiles=walk(legacyDirectory,(file)=>file.endsWith('.css')).map(rel);
  const selectorOwners=new Map(),tokenOwners=new Map(),digestOwners=new Map(),files=[];
  for(const file of allCss){
    const source=read(file),digest=hash(source),isActive=activeSet.has(path.resolve(file));
    if(!digestOwners.has(digest))digestOwners.set(digest,[]);digestOwners.get(digest).push(rel(file));
    if(isActive){
      for(const selector of extractSelectors(source)){if(!selectorOwners.has(selector))selectorOwners.set(selector,new Set());selectorOwners.get(selector).add(rel(file));}
      for(const token of [...source.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((match)=>match[1])){if(!tokenOwners.has(token))tokenOwners.set(token,new Set());tokenOwners.get(token).add(rel(file));}
    }
    files.push({path:rel(file),active:isActive,bytes:Buffer.byteLength(source),sha256:digest,imports:cssImports(file),important:count(source,/!important\b/g),gradients:count(source,/(?:linear|radial|conic)-gradient\s*\(/gi),pseudos:count(source,/::(?:before|after)\b/g)});
  }
  const duplicates=[...digestOwners.entries()].filter(([,owners])=>owners.length>1).map(([sha256,owners])=>({sha256,files:owners}));
  const selectorCollisions=[...selectorOwners.entries()].filter(([,owners])=>owners.size>1).filter(([selector])=>/(cgx-|hf-|cg-ui-|ds-|cgv-|pl-|kpi|surface|panel|table|form|button|input|select)/i.test(selector)).map(([selector,owners])=>({selector,files:[...owners]})).sort((a,b)=>b.files.length-a.files.length||a.selector.localeCompare(b.selector));
  const tokenCollisions=[...tokenOwners.entries()].filter(([,owners])=>owners.size>1).map(([token,owners])=>({token,files:[...owners]})).sort((a,b)=>b.files.length-a.files.length||a.token.localeCompare(b.token));
  return{runtime:rel(runtimeFile),runtimeImports,totalCssFiles:allCss.length,activeCssFiles:active.map(rel),inactiveCssFiles:allCss.filter((file)=>!activeSet.has(path.resolve(file))).map(rel),forbiddenRuntimeImports,missingRuntimeImports,unexpectedCss,missingCanonical,legacyDirectoryFiles,files,duplicates,selectorCollisions,tokenCollisions};
}

function auditTheme(){
  const catalog=read(path.join(root,'frontend','src','data','themeCatalog.js'));
  const app=read(path.join(root,'frontend','src','app.js'));
  const store=read(path.join(root,'frontend','src','state','store.js'));
  const catalogKeys=[...catalog.matchAll(/\{\s*key:'([^']+)'/g)].map((match)=>match[1]);
  const retiredCatalog=RETIRED_THEME_NAMES.filter((name)=>new RegExp(`key:'${name}'`).test(catalog));
  const retiredApp=RETIRED_THEME_NAMES.filter((name)=>new RegExp(`['"]${name}['"]`).test(app));
  return{catalogKeys,retiredCatalog,retiredApp,storeOfficialBinary:/OFFICIAL_THEMES\s*=\s*new Set\(\['light','dark'\]\)/.test(store),appBinary:/function applyTheme\(theme\)\{const normalized=theme==='dark'\?'dark':'light'/.test(app)};
}

function auditCriticalMigrations(){
  const app=read(path.join(root,'frontend','src','app.js'));
  const health=read(path.join(root,'frontend','src','pages','HealthcarePage.js'));
  const ledger=read(path.join(root,'frontend','src','pages','LedgerPage.js'));
  const adapters=read(path.join(root,'frontend','src','styles','module-adapters.css'));
  return{
    veterinaryDedicated:/veterinaria:\['\.\/pages\/VeterinaryClinicPageV1123\.jsx','VeterinaryClinicPage'\]/.test(app),
    healthAnimalBranchRemoved:!/(animal\s*\?|kind:\s*'animal'|careImmunizationForm)/.test(health),
    healthUsesCanonical:/MetricGrid/.test(health)&&/DataTable/.test(health)&&/Section/.test(health),
    ledgerUsesCanonical:/MetricGrid/.test(ledger)&&/Section/.test(ledger)&&/Table/.test(ledger),
    ledgerPrintStylesIsolated:/<style data-cg-print-only>/.test(ledger),
    adminContract:/cg-rbac-permission-grid/.test(adapters)&&/cg-admin-monitor-grid/.test(adapters),
    gymContract:/cg-gym-v1124-grid/.test(adapters)&&/cg-gym-v1124-form/.test(adapters),
    adaptersTokenOnly:!/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.test(adapters)&&!/(?:linear|radial|conic)-gradient\s*\(/i.test(adapters)
  };
}

function parityAudit(registry){
  const appRoutes=registry.map((item)=>item.route).sort();
  const catalogRoutes=MODULE_VISUAL_CATALOG.map((item)=>item.route).sort();
  return{appRoutes,catalogRoutes,missingInCatalog:appRoutes.filter((route)=>!catalogRoutes.includes(route)),missingInApp:catalogRoutes.filter((route)=>!appRoutes.includes(route)),ok:appRoutes.length===catalogRoutes.length&&appRoutes.every((route,index)=>route===catalogRoutes[index])};
}

function buildMarkdown(report){
  const findings=report.modules.flatMap((module)=>module.findings.map((finding)=>({route:module.route,...finding})));
  const bySeverity=(severity)=>findings.filter((item)=>item.severity===severity).length;
  const gateIssues=[...report.css.forbiddenRuntimeImports,...report.css.missingRuntimeImports,...report.css.unexpectedCss,...report.css.missingCanonical,...report.css.legacyDirectoryFiles,...report.theme.retiredCatalog,...report.theme.retiredApp];
  const migrationFailures=Object.entries(report.criticalMigrations).filter(([,ok])=>!ok).map(([key])=>key);
  const lines=['# ContaGest · Visual Source & Cascade Audit v13','',`Generado: ${report.generatedAt}`,'','## Gate v13','',`- Rutas: **${report.modules.length}** · catálogo QA: **${report.parity.ok?'PARIDAD':'DESCUADRE'}**`,`- CSS existentes: **${report.css.totalCssFiles}** · activos: **${report.css.activeCssFiles.length}**`,`- CSS inesperados: **${report.css.unexpectedCss.length}**`,`- Archivos legacy: **${report.css.legacyDirectoryFiles.length}**`,`- Imports runtime prohibidos: **${report.css.forbiddenRuntimeImports.length}**`,`- Temas retirados en runtime/catalog: **${report.theme.retiredApp.length + report.theme.retiredCatalog.length}**`,`- Migraciones críticas incumplidas: **${migrationFailures.length}**`,`- Hallazgos de páginas critical/high/medium/low: **${bySeverity('critical')} / ${bySeverity('high')} / ${bySeverity('medium')} / ${bySeverity('low')}**`,`- Gate estructural: **${gateIssues.length||migrationFailures.length||!report.parity.ok?'FAIL':'PASS'}**`,'','## Iteración por módulo','','| Ruta | Familia | Riesgo | Score | Print CSS aislado | Hallazgos |','|---|---|---|---:|---:|---|'];
  for(const module of report.modules)lines.push(`| ${escapeCell(module.route)} | ${escapeCell(module.family)} | ${escapeCell(module.priority)} | ${module.score} | ${module.metrics?.printOnlyStyleBlocks||0} | ${escapeCell(module.findings.map((item)=>`${item.severity}:${item.code}`).join(', ')||'—')} |`);
  lines.push('','## Runtime CSS','',`Imports: ${report.css.runtimeImports.map((item)=>`\`${item}\``).join(', ')||'—'}`,`CSS inesperados: ${report.css.unexpectedCss.map((item)=>`\`${item}\``).join(', ')||'ninguno'}`,`Legacy: ${report.css.legacyDirectoryFiles.map((item)=>`\`${item}\``).join(', ')||'ninguno'}`,'','## Colisiones de selector','');
  if(!report.css.selectorCollisions.length)lines.push('Ninguna colisión exacta detectada entre los pilares activos.');else for(const item of report.css.selectorCollisions.slice(0,100))lines.push(`- \`${item.selector}\` → ${item.files.map((file)=>`\`${file}\``).join(', ')}`);
  lines.push('','## Migraciones críticas','');for(const [key,value] of Object.entries(report.criticalMigrations))lines.push(`- ${value?'PASS':'FAIL'} · ${key}`);
  lines.push('','## Criterio de evidencia','','El source/cascade audit sólo certifica estructura. El estado BROWSER PASS continúa dependiendo de una ejecución real de Playwright; el auditor no fabrica esa evidencia.');
  return `${lines.join('\n')}\n`;
}

fs.mkdirSync(outDir,{recursive:true});
const registry=extractPageRegistry();
const modules=registry.map(auditPage).sort((a,b)=>a.route.localeCompare(b.route));
const css=auditCss();
const theme=auditTheme();
const criticalMigrations=auditCriticalMigrations();
const parity=parityAudit(registry);
const report={schemaVersion:13,generatedAt:new Date().toISOString(),strict,parity,modules,css,theme,criticalMigrations};
const jsonFile=path.join(outDir,'visual-source-audit.json'),mdFile=path.join(outDir,'visual-source-audit.md');
fs.writeFileSync(jsonFile,`${JSON.stringify(report,null,2)}\n`);fs.writeFileSync(mdFile,buildMarkdown(report));
const pageCritical=modules.flatMap((module)=>module.findings).filter((item)=>['critical','high'].includes(item.severity)).length;
const structural=css.forbiddenRuntimeImports.length+css.missingRuntimeImports.length+css.unexpectedCss.length+css.missingCanonical.length+css.legacyDirectoryFiles.length+theme.retiredCatalog.length+theme.retiredApp.length+(parity.ok?0:1)+Object.values(criticalMigrations).filter((value)=>!value).length;
console.log(`Visual v13 audit: ${modules.length} rutas · ${css.activeCssFiles.length}/${css.totalCssFiles} CSS activos · ${structural} fallos estructurales · ${pageCritical} hallazgos high/critical de página.`);
console.log(`Reporte: ${rel(mdFile)}`);
if(strict&&(structural>0||pageCritical>0))process.exitCode=1;
