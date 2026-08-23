import { PageHeader, Button, Badge, Section, Select, EmptyState, DataTable } from '../components/ui/index.js';
import { DataImportService, IMPORT_TEMPLATES } from '../services/dataImportService.js';
import { BackendApi } from '../services/backendApi.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));
const typeOptions=[
  {value:'inventory',label:'Inventario'},
  {value:'clients',label:'Clientes'},
  {value:'suppliers',label:'Proveedores'},
  {value:'accounts',label:'Plan de cuentas'},
  {value:'payroll',label:'Nómina'}
];

export const DataImportPage = {
  render(state) {
    const preview = state.importPreview || [];
    const accepted=preview.filter((row)=>row.ok).length;
    const rejected=preview.length-accepted;
    const rows=preview.slice(0,100).map((row)=>({
      index:row.index,
      status:row.ok?Badge('Válido','success'):Badge(`Faltan: ${(row.missing||[]).join(', ')}`,'danger'),
      record:`<code class="cg-ui-code">${safe(JSON.stringify(row.row))}</code>`
    }));
    const fields=Object.entries(IMPORT_TEMPLATES).map(([type,names])=>`<article class="cg-ui-card cg-ui-card-body"><strong>${safe(typeOptions.find((item)=>item.value===type)?.label||type)}</strong><p class="cg-ui-muted">${safe(names.join(', '))}</p></article>`).join('');
    return `<section class="cg-page-stack">${PageHeader({eyebrow:'Administración · Datos',title:'Preparar importación',description:'Valida estructura y contenido antes de una carga productiva. Esta pantalla no escribe inventario, clientes, proveedores, cuentas ni nómina directamente en el estado del navegador.',actions:Button({id:'btnDownloadTemplate',text:'Descargar plantilla CSV',icon:'fa-download',variant:'secondary'})})}
      ${Section({title:'Archivo y tipo de datos',subtitle:'El archivo se analiza localmente y se valida también contra el endpoint administrativo de previsualización. La aplicación productiva requiere un pipeline transaccional de backend; no se simula con mutaciones locales.',children:`<form id="importForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">${Select({labelKey:'Tipo de importación',name:'importType',options:typeOptions,attrs:'id="importType"'})}<label class="cgx-field cg-field-wide" for="importFile"><span class="cgx-label">Archivo</span><input id="importFile" class="input" type="file" accept=".csv,.txt,.tsv,.json,.xlsx" required></label></div><div class="cg-record-actions">${Button({text:'Validar y previsualizar',icon:'fa-file-circle-check',type:'submit'})}</div></form>`})}
      ${Section({title:'Campos esperados',subtitle:'Plantillas mínimas por tipo. La validación previa no reemplaza reglas fiscales, duplicados ni constraints del servidor.',children:`<div class="cg-ui-grid cg-ui-grid-three">${fields}</div>`})}
      ${Section({title:'Resultado de preflight',subtitle:preview.length?`${accepted} válidos · ${rejected} con errores · máximo 100 filas visibles`:'Sube un archivo para iniciar la validación.',actions:preview.length?`${Badge(`${accepted} válidos`,accepted?'success':'neutral')}${rejected?Badge(`${rejected} rechazados`,'danger'):''}`:'',children:preview.length?DataTable({columns:[{key:'index',label:'#'},{key:'status',label:'Estado',render:(row)=>row.status},{key:'record',label:'Registro',render:(row)=>row.record}],rows}):EmptyState({title:'Sin archivo validado',description:'No se ha escrito ningún dato en los módulos operativos.',iconName:'fa-file-import'})})}
      ${preview.length?Section({title:'Siguiente paso seguro',subtitle:'La validación terminó, pero no existe todavía un endpoint transaccional de commit para estas cinco familias. Para evitar datos fantasma o inconsistentes, ContaGest no ofrece un botón “Aplicar” hasta que el backend implemente dry-run, idempotencia, constraints, auditoría y rollback.',children:`<div class="cg-ui-row-wrap">${Badge('PREVIEW ONLY','warning')}<span class="cg-ui-muted">No se modificaron datos operativos.</span></div>`}):''}
    </section>`;
  },
  mount(_state, { Store, Toast, Loading }) {
    document.getElementById('btnDownloadTemplate')?.addEventListener('click', () => {
      const type = document.getElementById('importType')?.value || 'inventory';
      const blob = new Blob([DataImportService.buildTemplateCsv(type)], { type:'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `plantilla-${type}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    document.getElementById('importForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const type=document.getElementById('importType')?.value||'inventory';
      const file=document.getElementById('importFile')?.files?.[0];
      if(!file)return Toast.show('Selecciona un archivo.','warning');
      try{
        Loading?.mount?.('Validando archivo…');
        const parsed=await DataImportService.parseFile(file,type);
        const localPreview=DataImportService.validateRows(parsed,type);
        const acceptedRows=localPreview.filter((row)=>row.ok).map((row)=>row.row);
        if(acceptedRows.length)await BackendApi.post('/imports/preview',{type,rows:acceptedRows});
        Store.set({importPreview:localPreview,importType:type});
        const rejected=localPreview.filter((row)=>!row.ok).length;
        Toast.show(`${localPreview.length-rejected} filas válidas${rejected?`; ${rejected} requieren corrección`:''}. No se aplicaron cambios.`,rejected?'warning':'success');
      }catch(error){Toast.show(`No se pudo validar la importación: ${error.message}`,'error');}
      finally{Loading?.unmount?.();}
    });
  }
};
