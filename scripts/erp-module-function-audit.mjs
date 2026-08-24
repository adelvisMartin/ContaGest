import fs from 'node:fs';
import path from 'node:path';
import { MODULE_VISUAL_CATALOG } from '../qa/support/module-visual-catalog.mjs';

const root=process.cwd();
const strict=process.argv.includes('--strict');
const outDir=path.join(root,'artifacts','qa');
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');
const esc=(value)=>String(value??'').replaceAll('|','\\|').replaceAll('\n',' ');
const regexEscape=(value)=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function registry(){
  const source=read('frontend','src','app.js'),start=source.indexOf('const pageRegistry={'),end=source.indexOf('\n};',start);
  if(start<0||end<0)throw new Error('pageRegistry no encontrado');
  const block=source.slice(start,end+3),items=[],pattern=/(?:^|,)\s*(?:'([^']+)'|"([^"]+)"|([\w-]+))\s*:\s*\['\.\/pages\/([^']+)'\s*,\s*'([^']+)'\]/gm;
  for(const match of block.matchAll(pattern))items.push({route:match[1]||match[2]||match[3],file:match[4],exportName:match[5]});
  return items;
}
const uniq=(values)=>[...new Set(values)].sort();
const all=(source,re,index=1)=>uniq([...source.matchAll(re)].map((match)=>match[index]).filter(Boolean));

function variableBinding(source,formId){
  const id=regexEscape(formId);
  const assignment=new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*document\\.getElementById\\(['\"]${id}['\"]\\)`,'g');
  for(const match of source.matchAll(assignment)){
    const variable=regexEscape(match[1]);
    if(new RegExp(`${variable}\\?*\\.addEventListener\\(['\"]submit['\"]`).test(source))return true;
  }
  return false;
}

function delegatedDynamicBinding(source,formId){
  if(!formId.includes('${'))return false;
  const escaped=regexEscape(formId);
  const formPattern=new RegExp(`<form\\b[^>]*id=["']${escaped}["'][^>]*>`);
  const tag=source.match(formPattern)?.[0]||'';
  const dataAttrs=[...tag.matchAll(/\bdata-([a-z0-9-]+)=/gi)].map((match)=>match[1]);
  return dataAttrs.some((name)=>{
    const attr=regexEscape(name);
    return new RegExp(`querySelectorAll\\(['\"]\\[data-${attr}\\]['\"]\\)[\\s\\S]{0,300}?addEventListener\\(['\"]submit['\"]`).test(source);
  });
}

function hasFormBinding(source,formId){
  const id=regexEscape(formId);
  if(new RegExp(`mountSubmit\\(['\"]#${id}['\"]`).test(source))return true;
  if(new RegExp(`document\\.getElementById\\(['\"]${id}['\"]\\)\\?*\\.addEventListener\\(['\"]submit['\"]`).test(source))return true;
  if(new RegExp(`document\\.querySelector\\(['\"]#${id}['\"]\\)\\?*\\.addEventListener\\(['\"]submit['\"]`).test(source))return true;
  if(variableBinding(source,formId))return true;
  // Pages such as Gym/Healthcare centralize identical async submit semantics in
  // bind(id, service)/handle(id, service). Treat only named helper calls as a
  // binding when the helper itself attaches a submit listener by id.
  const helperDefinition=/\b(?:const|function)\s+(bind|handle|bindForm|bindSubmit)\b[\s\S]{0,260}?getElementById\(id\)\?*\.addEventListener\(['"]submit['"]/.exec(source);
  if(helperDefinition){
    const helper=regexEscape(helperDefinition[1]);
    if(new RegExp(`\\b${helper}\\(['\"]${id}['\"]`).test(source))return true;
  }
  if(delegatedDynamicBinding(source,formId))return true;
  return false;
}

function audit(entry){
  const source=read('frontend','src','pages',entry.file),catalog=MODULE_VISUAL_CATALOG.find((item)=>item.route===entry.route)||{},findings=[];
  const add=(severity,code,detail)=>findings.push({severity,code,detail});
  const hasRender=new RegExp(`export const ${entry.exportName}\\s*=|export\\s+const\\s+${entry.exportName}`).test(source)&&/\brender\s*\(/.test(source);
  const hasMount=/\bmount\s*\(/.test(source);
  const forms=all(source,/<form\b[^>]*\bid=["']([^"']+)["']/gi);
  const boundForms=forms.filter((form)=>hasFormBinding(source,form));
  const mountSubmit=all(source,/mountSubmit\(['"]#([^'"]+)['"]/g);
  const explicitSubmit=all(source,/getElementById\(['"]([^'"]+)['"]\)[\s\S]{0,180}?addEventListener\(['"]submit['"]/g);
  const buttons=all(source,/<button\b[^>]*\bid=["']([^"']+)["']/gi);
  const listeners=all(source,/getElementById\(['"]([^'"]+)['"]\)[\s\S]{0,180}?addEventListener/g);
  const dataActions=all(source,/\bdata-([a-z0-9-]+)=/gi);
  const services=uniq([...source.matchAll(/\b([A-Z][A-Za-z0-9]+Service)\.([A-Za-z0-9_]+)/g)].map((m)=>`${m[1]}.${m[2]}`));
  const apiHints=uniq([...source.matchAll(/['"](\/api\/v1\/[^'"]+|\/verticals\/[^'"]+)['"]/g)].map((m)=>m[1]));
  const storeWrites=(source.match(/Store\.(?:set|update)\s*\(/g)||[]).length;
  const toasts=(source.match(/Toast\.show\s*\(/g)||[]).length;
  const loading=(source.match(/Loading\?*\.?(?:mount|unmount)|Loading\.(?:mount|unmount)/g)||[]).length;
  const tryCatch=(source.match(/\bcatch\s*\(/g)||[]).length;
  const validation=(source.match(/reportValidity|checkValidity|required:true|required['"\s>]|aria-invalid|min=|max=|pattern=|throw new Error/g)||[]).length;
  const destructive=(source.match(/delete|remove|cancel|anular|revers|close|cerrar/gi)||[]).length;
  const confirmation=(source.match(/confirm\s*\(|Modal\.|reasonCode|confirmation/gi)||[]).length;
  const exportSignals=(source.match(/downloadText|window\.print|\.print\(|CSV|PDF|export/gi)||[]).length;
  const duplicateIds=buttons.filter((id)=>forms.includes(id));
  if(!hasRender)add('critical','missing-render','La página no expone render() detectable.');
  if(!hasMount&&!catalog.standalone)add('medium','missing-mount','No se detecta mount(); confirmar que la vista sea deliberadamente estática.');
  for(const form of forms)if(!boundForms.includes(form))add('high','unbound-form',`#${form} no tiene binding submit detectable.`);
  for(const button of buttons)if(!listeners.includes(button)&&!new RegExp(`data-(?:route|user-action|toggle|command|care|delete|ledger|quick|action)[^>]*${regexEscape(button)}`).test(source)&&!new RegExp(`querySelector\\(['"]#${regexEscape(button)}['"]`).test(source))add('low','button-review',`#${button} no tiene listener directo detectable; confirmar delegación.`);
  if(duplicateIds.length)add('high','duplicate-control-id',`IDs compartidos entre form/button: ${duplicateIds.join(', ')}`);
  if(forms.length&&!validation)add('medium','validation-signal','Hay formularios sin señales estáticas de validación/rangos.');
  if(destructive&&!confirmation&&['critical','high'].includes(catalog.priority))add('medium','destructive-confirmation','La ruta contiene operaciones potencialmente destructivas sin señal clara de confirmación/expediente.');
  const weights={critical:35,high:18,medium:7,low:2};
  const score=Math.max(0,100-findings.reduce((sum,item)=>sum+(weights[item.severity]||0),0));
  return{...entry,label:catalog.label||entry.route,family:catalog.family||'other',priority:catalog.priority||'medium',score,signals:{hasRender,hasMount,forms,boundForms,mountSubmit,explicitSubmit,buttons,listeners,dataActions,services,apiHints,storeWrites,toasts,loading,tryCatch,validation,destructive,confirmation,exportSignals},findings};
}

const modules=registry().map(audit).sort((a,b)=>a.route.localeCompare(b.route));
const parity={registry:modules.length,catalog:MODULE_VISUAL_CATALOG.length,ok:modules.length===MODULE_VISUAL_CATALOG.length&&modules.every((module)=>MODULE_VISUAL_CATALOG.some((item)=>item.route===module.route))};
const criticalFindings=modules.flatMap((module)=>module.findings.map((finding)=>({route:module.route,priority:module.priority,...finding}))).filter((item)=>['critical','high'].includes(item.severity));
const summary={routes:modules.length,forms:modules.reduce((sum,module)=>sum+module.signals.forms.length,0),boundForms:modules.reduce((sum,module)=>sum+module.signals.boundForms.length,0),services:uniq(modules.flatMap((module)=>module.signals.services)).length,criticalHighFindings:criticalFindings.length,averageScore:Math.round(modules.reduce((sum,module)=>sum+module.score,0)/Math.max(1,modules.length)),parity};
const report={schemaVersion:16,generatedAt:new Date().toISOString(),strict,summary,modules};
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'module-function-audit.json'),`${JSON.stringify(report,null,2)}\n`);
const lines=['# ContaGest · Module Function Audit v16','',`Generado: ${report.generatedAt}`,'',`Rutas: **${summary.routes}** · Forms: **${summary.forms}** · bindings detectados: **${summary.boundForms}** · servicios: **${summary.services}** · score medio: **${summary.averageScore}** · high/critical: **${summary.criticalHighFindings}**`,'','| Ruta | Familia | Riesgo | Score | Forms | Bound | Services | Findings |','|---|---|---|---:|---:|---:|---:|---|'];
for(const module of modules)lines.push(`| ${esc(module.route)} | ${esc(module.family)} | ${esc(module.priority)} | ${module.score} | ${module.signals.forms.length} | ${module.signals.boundForms.length} | ${module.signals.services.length} | ${esc(module.findings.map((item)=>`${item.severity}:${item.code}`).join(', ')||'—')} |`);
lines.push('','## Detalle por ruta','');for(const module of modules){lines.push(`### ${module.route} · ${module.label}`,'',`- render: ${module.signals.hasRender?'sí':'NO'} · mount: ${module.signals.hasMount?'sí':'no'} · forms: ${module.signals.forms.join(', ')||'—'} · bound: ${module.signals.boundForms.join(', ')||'—'}`,`- servicios: ${module.signals.services.join(', ')||'—'}`,`- acciones data-*: ${module.signals.dataActions.join(', ')||'—'}`,`- feedback: Toast=${module.signals.toasts}, Loading=${module.signals.loading}, catch=${module.signals.tryCatch}, validación=${module.signals.validation}`,`- findings: ${module.findings.map((item)=>`${item.severity}/${item.code}: ${item.detail}`).join(' · ')||'ninguno'}`,'');}
lines.push('## Interpretación','','Este inventario verifica contratos y bindings visibles en fuente, incluidas variables DOM, helpers bind/handle y formularios dinámicos delegados. No demuestra que una API externa o un flujo browser funcione: esos estados deben provenir de integración/Playwright y conservar NOT_EXECUTED si no corrieron.');
fs.writeFileSync(path.join(outDir,'module-function-audit.md'),`${lines.join('\n')}\n`);
console.log(`Functional audit v16: ${summary.routes} rutas · ${summary.forms} forms · ${summary.boundForms} bindings · ${summary.criticalHighFindings} high/critical · score medio ${summary.averageScore}.`);
if(strict&&(!parity.ok||criticalFindings.length))process.exitCode=1;
