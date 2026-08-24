import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const reportFile=path.join(root,'artifacts','qa','module-function-audit.json');
const run=spawnSync(process.execPath,[path.join(root,'scripts','erp-module-function-audit.mjs')],{cwd:root,stdio:'inherit'});
if(run.status!==0){
  console.error(`[function-gate] El auditor base terminó con código ${run.status}.`);
  process.exit(run.status||1);
}
if(!fs.existsSync(reportFile)){
  console.error('[function-gate] No se generó artifacts/qa/module-function-audit.json.');
  process.exit(1);
}

const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
const blocking=[];
const advisory=[];
for(const module of report.modules||[]){
  for(const finding of module.findings||[]){
    const item={route:module.route,file:module.file,severity:finding.severity,code:finding.code,detail:finding.detail};
    if(['critical','high'].includes(finding.severity))blocking.push(item); else advisory.push(item);
  }
}

console.log(`[function-gate] ${report.summary?.routes||0} rutas · ${report.summary?.forms||0} forms · ${blocking.length} high/critical.`);
for(const item of blocking){
  console.error(`[function-gate][${item.severity.toUpperCase()}] ${item.route} (${item.file}) · ${item.code} · ${item.detail}`);
}
if(advisory.length)console.log(`[function-gate] ${advisory.length} hallazgo(s) medium/low quedan registrados como revisión no bloqueante.`);
if(!report.summary?.parity?.ok){
  console.error('[function-gate][CRITICAL] El registro runtime y el catálogo QA no tienen paridad.');
  process.exit(1);
}
if(blocking.length)process.exit(1);
console.log('[function-gate][PASS] No quedan controles/formularios high/critical sin contrato funcional detectable.');
