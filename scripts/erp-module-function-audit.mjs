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
  const id=regexEscape(formId),assignment=new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*document\\.getElementById\\(['\"]${id}['\"]\\)`,'g');
  for(const match of source.matchAll(assignment)){const variable=regexEscape(match[1]);if(new RegExp(`${variable}\\?*\\.addEventListener\\(['\"]submit['\"]`).test(source))return true;}
  return false;
}
function delegatedDynamicBinding(source,formId){
  if(!formId.includes('${'))return false;
  const escaped=regexEscape(formId),formPattern=new RegExp(`<form\\b[^>]*id=["']${escaped}["'][^>]*>`),tag=source.match(formPattern)?.[0]||'',dataAttrs=[...tag.matchAll(/\bdata-([a-z0-9-]+)=/gi)].map((match)=>match[1]);
  return dataAttrs.some((name)=>{const attr=regexEscape(name);return new RegExp(`querySelectorAll\\(['\"]\\[data-${attr}\\]['\"]\\)[\\s\\S]{0,300}?addEventListener\\(['\"]submit['\"]`).test(source);});
}
function externalValidatedActionBinding(source,formId){
  const id=regexEscape(formId);
  const clickToForm=new RegExp(`addEventListener\\(['\"]click['\"][\\s\\S]{0,520}?getElementById\\(['\"]${id}['\"]\\)[\\s\\S]{0,260}?reportValidity\\(`);
  return clickToForm.test(source);
}
function hasFormBinding(source,formId){
  const id=regexEscape(formId);
  if(new RegExp(`mountSubmit\\(['\"]#${id}['\"]`).test(source))return true;
  if(new RegExp(`document\\.getElementById\\(['\"]${id}['\"]\\)\\?*\\.addEventListener\\(['\"]submit['\"]`).test(source))return true;
  if(new RegExp(`document\\.querySelector\\(['\"]#${id}['\"]\\)\\?*\\.addEventListener\\(['\"]submit['\"]`).test(source))return true;
  if(variableBinding(source,formId))return true;
  const helperDefinition=/\b(?:const|function)\s+(bind|handle|bindForm|bindSubmit)\b[\s\S]{0,260}?getElementById\(id\)\?*\.addEventListener\(['"]submit['"]/.exec(source);
  if(helperDefinition){const helper=regexEscape(helperDefinition[1]);if(new RegExp(`\\b${helper}\\(['\"]${id}['\"]`).test(source))return true;}
  if(delegatedDynamicBinding(source,formId))return true;
  if(externalValidatedActionBinding(source,formId))return true;
  return false;
}

function buttonTags(source){
  const result=new Map();
  for(const match of source.matchAll(/<button\b([^>]*)\bid=["']([^"']+)["']([^>]*)>/gi))result.set(match[2],`${match[1]} ${match[3]}`);
  return result;
}
function isSubmitButton(attrs=''){return /\btype\s*=\s*["']submit["']/i.test(attrs);}
function realDestructiveSignals(source){
  const signals=[];
  const patterns=[
    /\b(?:[A-Z][A-Za-z0-9]*Service|BackendApi)\.(delete|remove|cancel|void|anular|reverse|revert|close|cerrar|revoke)[A-Za-z0-9_]*\s*\(/gi,
    /\b(?:method\s*:\s*["']DELETE["']|\.delete\s*\()/gi,
    /\bdata-(delete|remove|cancel|void|anular|reverse|revert|close|revoke)(?:=|\b)/gi
  ];
  for(const pattern of patterns)for(const match of source.matchAll(pattern))signals.push(match[0]);
  return uniq(signals);
}
function confirmationSignals(source){return uniq([...source.matchAll(/\b(?:confirm\s*\(|Modal\.|reasonCode|confirmation|justification|motivo\s+de\s+(?:anulaci[oó]n|reverso|cierre)|reason\s*[:=])/gi)].map((m)=>m[0]));}
function localInteractionNeedsMount(source,forms,buttonTagMap){
  if(forms.length)return true;
  const localButtons=[...buttonTagMap].filter(([,attrs])=>!isSubmitButton(attrs)&&!/\bdata-(?:route|command-route|breadcrumb-route|query-clear|query-param)\b/i.test(attrs));
  if(localButtons.length)return true;
  // data-query-* and data-route are mounted globally by app/query enhancers.
  return /\bdata-(?:toggle|action|delete|remove|cancel|approve|care|ledger|tooth|pos-add|cart-inc|cart-dec|ai-prompt|ai-approve|ai-source-route)\b/i.test(source);
}

function audit(entry){
  const source=read('frontend','src','pages',entry.file),catalog=MODULE_VISUAL_CATALOG.find((item)=>item.route===entry.route)||{},findings=[];
  const add=(severity,code,detail)=>findings.push({severity,code,detail});
  const hasRender=new RegExp(`export const ${entry.exportName}\\s*=|export\\s+const\\s+${entry.exportName}`).test(source)&&/\brender\s*\(/.test(source);
  const hasMount=/\bmount\s*\(/.test(source);
  const forms=all(source,/<form\b[^>]*\bid=["']([^"']+)["']/gi),boundForms=forms.filter((form)=>hasFormBinding(source,form));
  const mountSubmit=all(source,/mountSubmit\(['"]#([^'"]+)['"]/g),explicitSubmit=all(source,/getElementById\(['"]([^'"]+)['"]\)[\s\S]{0,180}?addEventListener\(['"]submit['"]/g);
  const buttons=all(source,/<button\b[^>]*\bid=["']([^"']+)["']/gi),tags=buttonTags(source),listeners=all(source,/getElementById\(['"]([^'"]+)['"]\)[\s\S]{0,180}?addEventListener/g);
  const dataActions=all(source,/\bdata-([a-z0-9-]+)=/gi),services=uniq([...source.matchAll(/\b([A-Z][A-Za-z0-9]+Service)\.([A-Za-z0-9_]+)/g)].map((m)=>`${m[1]}.${m[2]}`)),apiHints=uniq([...source.matchAll(/['"](\/api\/v1\/[^'"]+|\/verticals\/[^'"]+)['"]/g)].map((m)=>m[1]));
  const storeWrites=(source.match(/Store\.(?:set|update)\s*\(/g)||[]).length,toasts=(source.match(/Toast\.show\s*\(/g)||[]).length,loading=(source.match(/Loading\?*\.?(?:mount|unmount)|Loading\.(?:mount|unmount)/g)||[]).length,tryCatch=(source.match(/\bcatch\s*\(/g)||[]).length;
  const validation=(source.match(/reportValidity|checkValidity|required\s*:\s*true|required[\s'">]|aria-invalid|min(?:length)?\s*=|max(?:length)?\s*=|pattern\s*=|throw new Error|\.trim\(\)|Number\.isFinite|Number\.isNaN/g)||[]).length;
  const destructiveSignals=realDestructiveSignals(source),confirmation=confirmationSignals(source),exportSignals=(source.match(/downloadText|window\.print|\.print\(|CSV|PDF|export/gi)||[]).length;
  const duplicateIds=buttons.filter((id)=>forms.includes(id));
  if(!hasRender)add('critical','missing-render','La página no expone render() detectable.');
  if(!hasMount&&localInteractionNeedsMount(source,forms,tags))add('medium','missing-mount','La página declara interacción local que no está cubierta por un mount() detectable.');
  for(const form of forms)if(!boundForms.includes(form))add('high','unbound-form',`#${form} no tiene binding submit detectable.`);
  for(const button of buttons){
    const attrs=tags.get(button)||'';
    if(isSubmitButton(attrs))continue;
    const globalButton=/\bdata-(?:route|command-route|breadcrumb-route|query-clear|query-param)\b/i.test(attrs);
    if(!listeners.includes(button)&&!globalButton&&!new RegExp(`querySelector\\(['"]#${regexEscape(button)}['"]`).test(source))add('low','button-review',`#${button} no tiene listener directo detectable; confirmar delegación.`);
  }
  if(duplicateIds.length)add('high','duplicate-control-id',`IDs compartidos entre form/button: ${duplicateIds.join(', ')}`);
  if(forms.length&&!validation)add('medium','validation-signal','Hay formularios sin señales estáticas de validación/rangos.');
  if(destructiveSignals.length&&!confirmation.length&&['critical','high'].includes(catalog.priority))add('medium','destructive-confirmation',`Operación destructiva real sin confirmación/expediente detectable: ${destructiveSignals.slice(0,4).join(', ')}.`);
  const weights={critical:35,high:18,medium:7,low:2},score=Math.max(0,100-findings.reduce((sum,item)=>sum+(weights[item.severity]||0),0));
  return{...entry,label:catalog.label||entry.route,family:catalog.family||'other',priority:catalog.priority||'medium',score,signals:{hasRender,hasMount,forms,boundForms,mountSubmit,explicitSubmit,buttons,listeners,dataActions,services,apiHints,storeWrites,toasts,loading,tryCatch,validation,destructive:destructiveSignals.length,destructiveSignals,confirmation:confirmation.length,confirmationSignals:confirmation,exportSignals},findings};
}

const modules=registry().map(audit).sort((a,b)=>a.route.localeCompare(b.route));
const parity={registry:modules.length,catalog:MODULE_VISUAL_CATALOG.length,ok:modules.length===MODULE_VISUAL_CATALOG.length&&modules.every((module)=>MODULE_VISUAL_CATALOG.some((item)=>item.route===module.route))};
const criticalFindings=modules.flatMap((module)=>module.findings.map((finding)=>({route:module.route,priority:module.priority,...finding}))).filter((item)=>['critical','high'].includes(item.severity));
const summary={routes:modules.length,forms:modules.reduce((sum,module)=>sum+module.signals.forms.length,0),boundForms:modules.reduce((sum,module)=>sum+module.signals.boundForms.length,0),services:uniq(modules.flatMap((module)=>module.signals.services)).length,criticalHighFindings:criticalFindings.length,averageScore:Math.round(modules.reduce((sum,module)=>sum+module.score,0)/Math.max(1,modules.length)),parity};
const report={schemaVersion:16,generatedAt:new Date().toISOString(),strict,summary,modules};
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'module-function-audit.json'),`${JSON.stringify(report,null,2)}\n`);
const lines=['# ContaGest · Module Function Audit v16.3','',`Generado: ${report.generatedAt}`,'',`Rutas: **${summary.routes}** · Forms: **${summary.forms}** · bindings detectados: **${summary.boundForms}** · servicios: **${summary.services}** · score medio: **${summary.averageScore}** · high/critical: **${summary.criticalHighFindings}**`,'','| Ruta | Familia | Riesgo | Score | Forms | Bound | Services | Findings |','|---|---|---|---:|---:|---:|---:|---|'];
for(const module of modules)lines.push(`| ${esc(module.route)} | ${esc(module.family)} | ${esc(module.priority)} | ${module.score} | ${module.signals.forms.length} | ${module.signals.boundForms.length} | ${module.signals.services.length} | ${esc(module.findings.map((item)=>`${item.severity}:${item.code}`).join(', ')||'—')} |`);
lines.push('','## Detalle por ruta','');
for(const module of modules){lines.push(`### ${module.route} · ${module.label}`,'',`- render: ${module.signals.hasRender?'sí':'NO'} · mount: ${module.signals.hasMount?'sí':'no (render/global enhancer)'} · forms: ${module.signals.forms.join(', ')||'—'} · bound: ${module.signals.boundForms.join(', ')||'—'}`,`- servicios: ${module.signals.services.join(', ')||'—'}`,`- destructivas reales: ${module.signals.destructiveSignals.join(', ')||'—'} · confirmación: ${module.signals.confirmationSignals.join(', ')||'—'}`,`- feedback: Toast=${module.signals.toasts}, Loading=${module.signals.loading}, catch=${module.signals.tryCatch}, validación=${module.signals.validation}`,`- findings: ${module.findings.map((item)=>`${item.severity}/${item.code}: ${item.detail}`).join(' · ')||'ninguno'}`,'');}
lines.push('## Interpretación','','El auditor v16.3 considera binding funcional tanto el submit directo/delegado como una acción modal externa que localiza el formulario y exige reportValidity() antes de ejecutar el servicio. Esto evita falsos positivos en modales cuyos botones de acción viven fuera del elemento <form> sin relajar la validación. La evidencia browser sigue siendo obligatoria para demostrar comportamiento en runtime.');
fs.writeFileSync(path.join(outDir,'module-function-audit.md'),`${lines.join('\n')}\n`);
console.log(`Functional audit v16.3: ${summary.routes} rutas · ${summary.forms} forms · ${summary.boundForms} bindings · ${summary.criticalHighFindings} high/critical · score medio ${summary.averageScore}.`);
if(strict&&(!parity.ok||criticalFindings.length))process.exitCode=1;
