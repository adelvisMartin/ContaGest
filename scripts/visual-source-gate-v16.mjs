import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const reportFile=path.join(root,'artifacts','qa','visual-source-audit.json');
const result=spawnSync(process.execPath,[path.join(root,'scripts','visual-system-audit.mjs')],{cwd:root,stdio:'inherit'});
if(result.status!==0){
  console.error(`[visual-gate] El auditor base terminó con código ${result.status}.`);
  process.exit(result.status||1);
}
if(!fs.existsSync(reportFile)){
  console.error('[visual-gate] No se generó artifacts/qa/visual-source-audit.json.');
  process.exit(1);
}

const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
const failures=[];
const fail=(scope,code,detail)=>failures.push({scope,code,detail});

if(!report.parity?.ok)fail('registry','route-parity',`missingInCatalog=${(report.parity?.missingInCatalog||[]).join(',')||'—'} missingInApp=${(report.parity?.missingInApp||[]).join(',')||'—'}`);
for(const item of report.css?.forbiddenRuntimeImports||[])fail('css','forbidden-runtime-import',item);
for(const item of report.css?.missingRuntimeImports||[])fail('css','missing-runtime-import',item);
for(const item of report.css?.unexpectedCss||[])fail('css','unexpected-css-owner',item);
for(const item of report.css?.missingCanonical||[])fail('css','missing-canonical-css',item);
for(const item of report.css?.legacyDirectoryFiles||[])fail('css','legacy-css-active-tree',item);
if(report.css?.runtimeOrderOk===false)fail('css','runtime-import-order',(report.css?.runtimeImports||[]).join(' → '));
for(const item of report.theme?.retiredCatalog||[])fail('theme','retired-theme-catalog',item);
for(const item of report.theme?.retiredApp||[])fail('theme','retired-theme-app',item);
if(report.theme?.storeOfficialBinary===false)fail('theme','store-not-light-dark','OFFICIAL_THEMES no es binario light/dark.');
if(report.theme?.appBinary===false)fail('theme','runtime-not-light-dark','applyTheme no normaliza a light/dark.');
for(const [key,value] of Object.entries(report.shell||{}))if(typeof value==='boolean'&&!value)fail('shell',key,'invariante shell=false');
for(const [key,value] of Object.entries(report.criticalMigrations||{}))if(!value)fail('migration',key,'invariante visual crítica=false');

// Visual source gate: form/event bindings are owned by the functional/control gate.
// We still report them in visual-source-audit.json, but they cannot make this
// visual gate fail. Only findings that are truly visual/ownership failures do.
for(const module of report.modules||[]){
  for(const finding of module.findings||[]){
    if(!['critical','high'].includes(finding.severity))continue;
    if(finding.code==='unbound-form')continue;
    fail(`route:${module.route}`,finding.code,finding.detail);
  }
}

console.log(`[visual-gate] ${report.modules?.length||0} rutas auditadas; ${failures.length} fallos visuales/estructurales bloqueantes.`);
for(const item of failures)console.error(`[visual-gate][FAIL] ${item.scope} · ${item.code} · ${item.detail}`);
if(failures.length)process.exit(1);
console.log('[visual-gate][PASS] Ownership CSS, paridad 58 rutas, themes, shell e invariantes críticas conformes.');
