import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const outDir=path.join(root,'artifacts','qa');
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');
const regexEscape=(value)=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const camel=(name)=>name.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());

function registry(){
  const source=read('frontend','src','app.js');
  const start=source.indexOf('const pageRegistry={');
  const end=source.indexOf('\n};',start);
  if(start<0||end<0)throw new Error('pageRegistry no encontrado');
  const block=source.slice(start,end+3),items=[];
  const pattern=/(?:^|,)\s*(?:'([^']+)'|"([^"]+)"|([\w-]+))\s*:\s*\['\.\/pages\/([^']+)'\s*,\s*'([^']+)'\]/gm;
  for(const match of block.matchAll(pattern))items.push({route:match[1]||match[2]||match[3],file:match[4],exportName:match[5]});
  return items;
}

function variableEventBinding(source,id,event='click'){
  const escaped=regexEscape(id);
  const assignment=new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:document\\.getElementById\\(['\"]${escaped}['\"]\\)|qs\\(['\"]#${escaped}['\"]\\))`,'g');
  for(const match of source.matchAll(assignment)){
    const variable=regexEscape(match[1]);
    if(new RegExp(`${variable}\\?*\\.addEventListener\\(['\"]${event}['\"]`).test(source))return true;
  }
  return false;
}

function hasIdAction(source,id){
  const escaped=regexEscape(id);
  return new RegExp(`getElementById\\(['\"]${escaped}['\"]\\)[\\s\\S]{0,260}?addEventListener`).test(source)
    || new RegExp(`querySelector\\(['\"]#${escaped}['\"]\\)[\\s\\S]{0,260}?addEventListener`).test(source)
    || new RegExp(`\\bqs\\(['\"]#${escaped}['\"]\\)\\?*\\.addEventListener`).test(source)
    || new RegExp(`\\bqsa\\(['\"]#${escaped}['\"]\\)[\\s\\S]{0,180}?addEventListener`).test(source)
    || variableEventBinding(source,id,'click')
    || variableEventBinding(source,id,'change')
    || variableEventBinding(source,id,'input');
}

function dataConsumer(source,name){
  const escaped=regexEscape(name),property=regexEscape(camel(name));
  return new RegExp(`(?:querySelector(?:All)?|closest|matches|qs|qsa)\\([^)]*\\[data-${escaped}(?:[=\\]])`).test(source)
    || new RegExp(`dataset\\.${property}\\b`).test(source)
    || new RegExp(`dataset\\[['\"]${escaped}['\"]\\]`).test(source);
}

function attrsMap(attrs){
  const out={};
  for(const match of String(attrs).matchAll(/\b([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*["']([^"']*)["']/g))out[match[1].toLowerCase()]=match[2];
  return out;
}

const entries=registry();
const routes=new Set(entries.map((entry)=>entry.route));
const app=read('frontend','src','app.js');
const layout=read('frontend','src','components','layout.js');
const kit=read('frontend','src','components','ui','kit.js');
const globalConsumers=`${app}\n${layout}\n${kit}`;
const uniqueFiles=[...new Set(entries.map((entry)=>entry.file))];
const routeByFile=new Map(uniqueFiles.map((file)=>[file,entries.filter((entry)=>entry.file===file).map((entry)=>entry.route)]));
const findings=[];
const metrics={routeEntries:entries.length,uniquePageFiles:uniqueFiles.length,rawButtons:0,kitButtons:0,icons:0,iconOnlyButtons:0};
const add=(severity,file,code,detail,control='')=>findings.push({severity,file,routes:routeByFile.get(file)||[],code,detail,control});
const passiveData=new Set(['mui-button-fallback','cgx-kit','i18n','no-mui','tone','status']);

for(const file of uniqueFiles){
  const source=read('frontend','src','pages',file);
  const combined=`${source}\n${globalConsumers}`;

  // Deliberately case-sensitive: React/MUI <Button> is not a native <button>
  // and has different default semantics/accessibility handling.
  for(const match of source.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)){
    metrics.rawButtons++;
    const attrs=attrsMap(match[1]);
    const body=match[2];
    const type=String(attrs.type||'').toLowerCase();
    const id=attrs.id||'';
    const dynamicId=id.includes('${');
    const visible=body.replace(/<[^>]+>/g,' ').replace(/\$\{[^}]*\}/g,' dynamic ').replace(/\s+/g,' ').trim();
    const iconOnly=!visible && /<(?:i|svg)\b/i.test(body);
    if(iconOnly){
      metrics.iconOnlyButtons++;
      if(!attrs['aria-label']&&!attrs.title)add('high',file,'icon-button-label','Botón sólo-icono sin aria-label ni title.',id||match[0].slice(0,90));
    }
    if(!type)add('high',file,'button-type','Botón raw sin type explícito; dentro de un formulario puede disparar submit accidental.',id||match[0].slice(0,90));

    const dataAttrs=Object.keys(attrs).filter((name)=>name.startsWith('data-')).map((name)=>name.slice(5));
    const actionable=dataAttrs.filter((name)=>!passiveData.has(name));
    const route=attrs['data-route'];
    if(route&&!route.includes('${')&&!routes.has(route))add('high',file,'invalid-route',`data-route="${route}" no existe en pageRegistry.`,id||route);

    const hasDataAction=actionable.some((name)=>name==='route'||dataConsumer(combined,name));
    if(id&&!dynamicId&&!['submit','reset'].includes(type)&&!route&&!hasDataAction&&!hasIdAction(source,id)){
      add('high',file,'button-no-action',`#${id} no tiene listener, ruta ni contrato data-* consumido detectable.`,id);
    }
    for(const name of actionable){
      if(name==='route')continue;
      if(!dataConsumer(combined,name))add('medium',file,'data-action-review',`data-${name} aparece en un botón pero no se detecta consumidor por selector/dataset.`,id||name);
    }
  }

  // Canonical Button(...) calls always render visible text, but an explicit id
  // must still resolve to an event or a data-route/action supplied in attrs.
  for(const match of source.matchAll(/Button\(\{([\s\S]{0,700}?)\}\)/g)){
    metrics.kitButtons++;
    const block=match[1];
    const id=block.match(/\bid\s*:\s*['"]([^'"]+)['"]/)?.[1]||'';
    const type=block.match(/\btype\s*:\s*['"]([^'"]+)['"]/)?.[1]||'';
    const route=block.match(/\broute\s*:\s*['"]([^'"]+)['"]/)?.[1]||block.match(/data-route=\\?['"]([^'"\\]+)['"]/)?.[1]||'';
    const attrs=block.match(/\battrs\s*:\s*['"`]([\s\S]*?)['"`]/)?.[1]||'';
    const hasActionAttr=/data-[a-z0-9-]+/i.test(attrs);
    if(route&&!routes.has(route))add('high',file,'invalid-kit-route',`Button() apunta a ruta inexistente: ${route}.`,id||route);
    if(id&&!['submit','reset'].includes(type)&&!route&&!hasActionAttr&&!hasIdAction(source,id))add('high',file,'kit-button-no-action',`Button() #${id} no tiene acción detectable.`,id);
  }

  for(const match of source.matchAll(/<i\b[^>]*class=["']([^"']+)["'][^>]*>/gi)){
    metrics.icons++;
    const classes=match[1].split(/\s+/).filter(Boolean);
    const families=classes.filter((value)=>['fa-solid','fa-regular','fa-brands','fa-light','fa-thin','fa-duotone','fa-sharp'].includes(value));
    if(new Set(families).size>1)add('high',file,'mixed-icon-family',`Icono mezcla familias Font Awesome: ${families.join(', ')}.`,match[1]);
  }
  if(/material-symbols|material-icons/.test(source))add('medium',file,'legacy-icon-family','La página conserva Material Icons/Symbols fuera del contrato Font Awesome canónico.');
}

if(!/const faFamilies\s*=\s*new Set/.test(kit)||!/family=tokens\.find/.test(kit)){
  findings.push({severity:'high',file:'components/ui/kit.js',routes:[],code:'icon-family-helper',detail:'El helper canónico icon() no preserva familias Font Awesome.',control:'icon()'});
}

const blocking=findings.filter((item)=>['critical','high'].includes(item.severity));
const report={schemaVersion:16,generatedAt:new Date().toISOString(),metrics,blocking:blocking.length,findings};
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'ui-control-audit-v16.json'),`${JSON.stringify(report,null,2)}\n`);
const md=['# ContaGest · UI Control Audit v16','',`Rutas runtime: **${metrics.routeEntries}** · archivos de página únicos: **${metrics.uniquePageFiles}** · botones raw: **${metrics.rawButtons}** · Button() kit: **${metrics.kitButtons}** · iconos raw: **${metrics.icons}** · bloqueantes: **${blocking.length}**`,'','| Severidad | Rutas | Archivo | Código | Control | Detalle |','|---|---|---|---|---|---|',...findings.map((item)=>`| ${item.severity} | ${(item.routes||[]).join(', ')||'shared'} | ${item.file} | ${item.code} | ${String(item.control||'').replaceAll('|','\\|')} | ${item.detail.replaceAll('|','\\|')} |`),'','Este gate es análisis estático de controles, rutas, accesibilidad básica e iconos. No sustituye un click real en navegador.'];
fs.writeFileSync(path.join(outDir,'ui-control-audit-v16.md'),`${md.join('\n')}\n`);
console.log(`[control-gate] ${metrics.routeEntries} rutas · ${metrics.rawButtons} raw buttons · ${metrics.kitButtons} Button() · ${metrics.icons} icons · ${blocking.length} high/critical.`);
for(const item of blocking)console.error(`[control-gate][${item.severity.toUpperCase()}] ${(item.routes||[]).join(',')||'shared'} · ${item.file} · ${item.code} · ${item.detail} ${item.control?`[${item.control}]`:''}`);
if(blocking.length)process.exit(1);
console.log('[control-gate][PASS] Botones, rutas, icon-only accessibility e icon families sin bloqueantes estáticos detectados.');
