import { PageHeader, Button, Badge, Section, Select, EmptyState, DataTable } from '../components/ui/index.js';
import { DataImportService, IMPORT_TEMPLATES } from '../services/dataImportService.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));
const typeOptions=[
  {value:'inventory',label:'Inventario / productos'},
  {value:'clients',label:'Clientes'},
  {value:'suppliers',label:'Proveedores'},
  {value:'accounts',label:'Plan de cuentas'},
  {value:'payroll',label:'Nómina / empleados'}
];
const exportTypeOptions=typeOptions.filter(({value})=>value!=='payroll');
const exportFormatOptions=[
  {value:'csv',label:'CSV (seguro para hojas de cálculo)'},
  {value:'json',label:'JSON (datos exactos)'}
];
const duplicateOptions=[
  {value:'error',label:'Error si ya existe'},
  {value:'update',label:'Actualizar si ya existe'},
  {value:'skip',label:'Omitir si ya existe'}
];

const downloadText=(text,filename,type='text/csv')=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=filename;a.click();URL.revokeObjectURL(a.href);};

export const DataImportPage = {
  render(state) {
    const batch=state.importBatch||null;
    const preview=batch?.rows||[];
    const accepted=batch?.accepted||0;const rejected=batch?.rejected||0;
    const rows=preview.slice(0,100).map((row)=>({
      index:row.index,
      action:row.action==='error'?Badge('Error','danger'):row.action==='update'?Badge('Actualizar','warning'):row.action==='skip'?Badge('Omitir','neutral'):Badge('Crear','success'),
      status:row.errors?.length?`<span class="cg-text-danger">${safe(row.errors.map((e)=>`${e.field}: ${e.message}`).join(' · '))}</span>`:Badge('Validado','success'),
      record:`<code class="cg-ui-code">${safe(JSON.stringify(row.row))}</code>`
    }));
    const fields=Object.entries(IMPORT_TEMPLATES).map(([type,names])=>`<article class="cg-ui-card cg-ui-card-body"><strong>${safe(typeOptions.find((item)=>item.value===type)?.label||type)}</strong><p class="cg-ui-muted">${safe(names.join(', '))}</p></article>`).join('');
    const statusTone=batch?.status==='completed'?'success':batch?.status==='validated'?'brand':batch?.status==='invalid'?'danger':'warning';
    const batchActions=batch?`<div class="cg-ui-row-wrap">${Badge(String(batch.status||'draft').toUpperCase(),statusTone)}${batch.status==='validated'?Button({id:'btnCommitImport',text:'Confirmar y aplicar',icon:'fa-database'}):''}${Button({id:'btnImportReport',text:'Descargar reporte',icon:'fa-file-arrow-down',variant:'secondary'})}</div>`:'';
    return `<section class="cg-page-stack">${PageHeader({eyebrow:'Administración · Datos',title:'Importación transaccional',description:'Dry-run reproducible, política de duplicados, confirmación explícita, idempotencia, rollback transaccional y auditoría por batch.',actions:Button({id:'btnDownloadTemplate',text:'Descargar plantilla CSV',icon:'fa-download',variant:'secondary'})})}
      ${Section({title:'Archivo y política',subtitle:'CSV, TSV, JSON y primera hoja XLSX. Máximo 5 MB y 5.000 filas. Cada archivo debe aprobar el análisis antimalware local antes de abrirse o crear el dry-run; sin veredicto limpio no se importa.',children:`<form id="importForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">${Select({labelKey:'Tipo de importación',name:'importType',options:typeOptions,attrs:'id="importType"'})}${Select({labelKey:'Duplicados',name:'duplicatePolicy',options:duplicateOptions,attrs:'id="duplicatePolicy"'})}<label class="cgx-field cg-field-wide" for="importFile"><span class="cgx-label">Archivo</span><input id="importFile" class="input" type="file" accept=".csv,.txt,.tsv,.json,.xlsx" aria-describedby="importFileStatus" required></label></div><div class="cg-record-actions">${Button({text:'Ejecutar dry-run',icon:'fa-file-circle-check',type:'submit'})}</div><p id="importFileStatus" class="cg-ui-muted" role="status" aria-live="polite" aria-atomic="true">Selecciona un archivo para verificarlo antes de la importación.</p></form>`})}
      ${Section({title:'Exportar datos maestros',subtitle:'Solo lectura y con auditoría por empresa. Se exportan clientes, proveedores, productos y cuentas; no saldos de inventario ni datos de nómina.',children:`<div class="cg-record-fields cg-fields-compact">${Select({labelKey:'Datos para exportar',name:'exportType',options:exportTypeOptions,attrs:'id="exportType"'})}${Select({labelKey:'Formato',name:'exportFormat',options:exportFormatOptions,attrs:'id="exportFormat"'})}</div><div class="cg-record-actions">${Button({id:'btnExportMaster',text:'Descargar exportación',type:'button',icon:'fa-file-export'})}</div>`})}
      ${Section({title:'Campos esperados',subtitle:'Las plantillas son versionadas. Inventario importa datos maestros; stock y reservas no son columnas aceptadas porque deben entrar por movimientos auditables.',children:`<div class="cg-ui-grid cg-ui-grid-three">${fields}</div>`})}
      ${Section({title:'Resultado del dry-run',subtitle:batch?`${accepted} aceptadas · ${rejected} rechazadas · checksum ${safe(String(batch.checksum||'').slice(0,12))}… · expira ${safe(new Date(batch.expiresAt).toLocaleString())}`:'Sube un archivo para crear un batch de staging.',actions:batchActions,children:preview.length?DataTable({columns:[{key:'index',label:'#'},{key:'action',label:'Acción',render:(row)=>row.action},{key:'status',label:'Validación',render:(row)=>row.status},{key:'record',label:'Registro normalizado',render:(row)=>row.record}],rows}):batch?.status==='completed'?`<div class="cg-ui-row-wrap">${Badge('COMPLETED','success')}<span class="cg-ui-muted">${safe(batch.counts?.created||0)} creados · ${safe(batch.counts?.updated||0)} actualizados · ${safe(batch.counts?.skipped||0)} omitidos.</span></div>`:EmptyState({title:'Sin batch validado',description:'El dry-run persiste sólo staging administrativo; no modifica clientes, productos, cuentas ni empleados.',iconName:'fa-file-import'})})}
      ${batch?.status==='invalid'?Section({title:'Commit bloqueado',subtitle:'Corrige el archivo o cambia la política de duplicados y ejecuta un nuevo dry-run. Nunca se aplican parcialmente filas de un batch inválido.',children:`<div class="cg-ui-row-wrap">${Badge('NO BUSINESS WRITES','danger')}<span class="cg-ui-muted">${rejected} filas deben corregirse antes de confirmar.</span></div>`}):''}
      ${batch?.status==='validated'?Section({title:'Listo para confirmación',subtitle:'El commit reutiliza exactamente este checksum y se ejecuta en una transacción. Un retry del mismo batch no duplica efectos.',children:`<div class="cg-ui-row-wrap">${Badge('DRY-RUN OK','success')}<span class="cg-ui-muted">Revisa acciones create/update/skip antes de aplicar.</span></div>`}):''}
    </section>`;
  },
  mount(_state, { Store, Toast, Loading }) {
    document.getElementById('btnDownloadTemplate')?.addEventListener('click',()=>{const type=document.getElementById('importType')?.value||'inventory';downloadText(DataImportService.buildTemplateCsv(type),`plantilla-${type}-v1.csv`);});
    let exporting=false;
    document.getElementById('btnExportMaster')?.addEventListener('click',async()=>{
      if(exporting)return;
      const button=document.getElementById('btnExportMaster');
      const type=document.getElementById('exportType')?.value||'inventory';
      const format=document.getElementById('exportFormat')?.value||'csv';
      if(!exportTypeOptions.some(option=>option.value===type))return Toast.show('Selecciona un conjunto de datos autorizado.','warning');
      exporting=true;
      if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
      try{
        Loading?.mount?.('Exportando datos maestros…');
        const chunks=[];const records=[];let cursor=null;let pages=0;let count=0;
        do{
          const page=await DataImportService.exportMasterPage(type,{format,limit:500,cursor});
          if(!page||page.type!==type||page.format!==format||!Number.isSafeInteger(page.count))
            throw new Error('El servidor devolvió una página de exportación inválida.');
          if(format==='json'){
            if(!Array.isArray(page.records)||page.records.length!==page.count)
              throw new Error('La página JSON está incompleta.');
            records.push(...page.records);
          }else{
            if(typeof page.csv!=='string')throw new Error('La página CSV está incompleta.');
            const headerEnd=page.csv.indexOf('\n');
            if(headerEnd<0&&page.count>0)throw new Error('La página CSV carece de encabezados.');
            chunks.push(pages===0?page.csv:(headerEnd<0?'':page.csv.slice(headerEnd+1)));
          }
          count+=page.count;pages++;
          if(page.hasMore&&!page.nextCursor)throw new Error('El servidor no indicó cómo continuar la exportación.');
          if(page.hasMore&&pages>=100)throw new Error('La exportación supera 50.000 registros; usa páginas más pequeñas.');
          cursor=page.hasMore?page.nextCursor:null;
        }while(cursor);
        const text=format==='json'?JSON.stringify(records,null,2):chunks.filter((chunk)=>chunk.length).join('\n');
        downloadText(text,`contagest-${type}-${new Date().toISOString().slice(0,10)}.${format}`,format==='json'?'application/json':'text/csv;charset=utf-8');
        Toast.show(`Exportación completada: ${count} registros.`,'success');
      }catch(error){Toast.show(`No se pudo exportar: ${error?.message||'Error inesperado'}`,'error');}
      finally{
        exporting=false;
        if(button){button.disabled=false;button.removeAttribute('aria-busy');}
        Loading?.unmount?.();
      }
    });
    let importing=false;
    document.getElementById('importForm')?.addEventListener('submit',async(event)=>{
      event.preventDefault();
      if(importing)return;
      const type=document.getElementById('importType')?.value||'inventory';const duplicatePolicy=document.getElementById('duplicatePolicy')?.value||'error';const file=document.getElementById('importFile')?.files?.[0];if(!file)return Toast.show('Selecciona un archivo.','warning');
      importing=true;
      const form=event.currentTarget;
      const controls=Array.from(form.querySelectorAll('input, select, button')).filter(control=>!control.disabled);
      const status=form.querySelector('#importFileStatus');
      const announce=message=>{if(status?.isConnected)status.textContent=message;};
      const submitButton=form.querySelector('button[type="submit"]');
      submitButton?.setAttribute('aria-busy','true');
      controls.forEach(control=>{control.disabled=true;});
      announce('Verificando la seguridad del archivo. Aún no se aplicó ningún cambio.');
      try {
        Loading?.mount?.('Verificando seguridad y validando batch…');
        const parsed=await DataImportService.parseFile(file,type);
        announce('Archivo analizado. Validando los registros en el servidor…');
        const local=DataImportService.validateRows(parsed,type);
        if(local.some(row=>!row.ok))Toast.show('La revisión local detectó campos requeridos faltantes; el servidor emitirá el detalle autoritativo.','warning');
        const batch=await DataImportService.preview({type,rows:parsed,filename:file.name,duplicatePolicy});
        const message=batch.status==='validated'? `${batch.accepted} filas listas para confirmar.` : `${batch.rejected} filas rechazadas; no se aplicó ningún cambio.`;
        announce(message);
        Store.set({importBatch:batch,importPreview:batch.rows||[],importType:type});
        Toast.show(message,batch.status==='validated'?'success':'warning');
      }catch(error){
        const message=`No se pudo ejecutar el dry-run: ${error.message}`;
        announce(message+' Si hay un resultado anterior, sigue correspondiendo al archivo anterior.');
        Toast.show(message,'error');
      }finally{
        importing=false;
        controls.forEach(control=>{control.disabled=false;});
        submitButton?.removeAttribute('aria-busy');
        Loading?.unmount?.();
      }
    });
    document.getElementById('btnCommitImport')?.addEventListener('click',async()=>{const batch=Store.get().importBatch;if(!batch||batch.status!=='validated')return;const confirmed=window.confirm(`Aplicar batch ${batch.id}\n${batch.accepted} filas\nChecksum ${String(batch.checksum).slice(0,16)}…\n\nEl commit será transaccional.`);if(!confirmed)return;try{Loading?.mount?.('Aplicando importación transaccional…');const completed=await DataImportService.commit(batch);Store.set({importBatch:completed,importPreview:[]});Toast.show(`Importación completada: ${completed.counts?.created||0} creados, ${completed.counts?.updated||0} actualizados, ${completed.counts?.skipped||0} omitidos.`,'success');}catch(error){Toast.show(`El commit no se aplicó: ${error.message}`,'error');}finally{Loading?.unmount?.();}});
    document.getElementById('btnImportReport')?.addEventListener('click',async()=>{const batch=Store.get().importBatch;if(!batch)return;try{const report=await DataImportService.report(batch.id);downloadText(report.csv,report.filename);Toast.show('Reporte de importación descargado.','success');}catch(error){Toast.show(`No se pudo descargar el reporte: ${error.message}`,'error');}});
  }
};
