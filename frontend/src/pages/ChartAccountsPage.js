import { PageHeader, MetricGrid, Section, DataTable, Button, Field, Select, Badge } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';
import { CHART_OF_ACCOUNTS, ACCOUNTING_POLICIES } from '../data/chartOfAccounts.js';
import { JournalTemplates } from '../core/accountingEngine.js';
import { ExportService } from '../services/exportService.js';
import { ChartAccountsService } from '../services/chartAccountsService.js';

const safe=(value)=>escapeHtml(String(value??''));
const effectiveAccounts=(state)=>{
  const persisted=state.accounting?.chartAccounts;
  if(Array.isArray(persisted)&&state.accounting?.chartAccountsLoaded)return persisted;
  return CHART_OF_ACCOUNTS;
};

export const ChartAccountsPage = {
  render(state) {
    const allAccounts=effectiveAccounts(state);
    const k={
      total:allAccounts.length,
      postable:allAccounts.filter((account)=>account.allowPosting).length,
      assets:allAccounts.filter((account)=>account.type==='activo').length,
      expenses:allAccounts.filter((account)=>account.type==='gasto').length
    };
    const sampleSale=JournalTemplates.sale({subtotal:2500,iva:400,igtf:0,total:2900});
    const rows=allAccounts.slice(0,260).map((account)=>({
      ...account,
      accountLabel:`${'· '.repeat(Math.max(0,Number(account.level||1)-1))}${account.name}`
    }));

    const form=`<form id="customAccountForm" class="cg-record-form"><div class="cg-record-fields">
      ${Field({labelKey:'Código',name:'code',placeholder:'1.1.01.001',required:true})}
      ${Field({labelKey:'Nombre de cuenta',name:'name',placeholder:'Caja principal',required:true,className:'cg-form-span'})}
      ${Select({labelKey:'Tipo',name:'type',options:['activo','pasivo','patrimonio','ingreso','costo','gasto'].map((value)=>({value,label:value[0].toUpperCase()+value.slice(1)}))})}
      ${Select({labelKey:'Naturaleza',name:'nature',options:[{value:'debit',label:'Débito'},{value:'credit',label:'Crédito'}]})}
      ${Field({labelKey:'Cuenta padre (opcional)',name:'parentCode',placeholder:'1.1.01'})}
      </div><div class="cg-record-actions">${Button({text:'Guardar cuenta en servidor',icon:'fa-plus',type:'submit'})}</div></form>`;

    return `<section class="cgx-page cg-page-stack accounting-chart-page">
      ${PageHeader({
        eyebrow:'Contabilidad',
        title:'Plan de Cuentas VEN-NIF configurable',
        description:ACCOUNTING_POLICIES.warning,
        actions:`${Button({id:'btnRefreshAccounts',text:'Actualizar',icon:'fa-rotate',variant:'secondary'})}${Button({id:'btnSyncAccountTemplate',text:'Sincronizar plantilla',icon:'fa-cloud-arrow-up',variant:'secondary'})}${Button({id:'btnExportAccountsXlsx',text:'XLSX',icon:'fa-file-excel'})}${Button({id:'btnExportAccountsTxt',text:'TXT',icon:'fa-file-lines',variant:'secondary'})}`
      })}
      ${MetricGrid([
        {label:'Cuentas',value:String(k.total),hint:state.accounting?.chartAccountsLoaded?'Catálogo persistido del tenant':'Plantilla local mientras carga',iconName:'fa-sitemap',tone:'brand'},
        {label:'Imputables',value:String(k.postable),hint:'Permiten asientos',iconName:'fa-pen-nib',tone:'success'},
        {label:'Activos',value:String(k.assets),hint:'Cuentas clasificadas como activo',iconName:'fa-building-columns',tone:'neutral'},
        {label:'Gastos',value:String(k.expenses),hint:'Control operativo',iconName:'fa-chart-line',tone:'warning'}
      ])}
      <div class="cg-ui-grid cg-ui-grid-two">
        ${Section({
          title:'Validación de partida doble',
          subtitle:'Ejemplo de venta: débito clientes, crédito ventas e IVA. El motor rechaza diferencias, cuentas inexistentes o cuentas de agrupación.',
          children:`${sampleSale.ok?Badge('Asiento balanceado','success'):Badge('Error de validación','danger')}<div class="cgx-table-wrap"><pre class="cg-ui-code">${safe(JSON.stringify(sampleSale.lines.map(({account,errors,...line})=>line),null,2))}</pre></div>`
        })}
        ${Section({
          title:'Política contable',
          subtitle:`${ACCOUNTING_POLICIES.standard} · versión ${ACCOUNTING_POLICIES.version}`,
          children:'<ul class="cg-accounting-policy-list"><li>Cierres por período para impedir edición histórica.</li><li>Reversos en vez de eliminación.</li><li>Plantillas por fuente: ventas, compras, nómina, bancos e impuestos.</li><li>Las cuentas creadas desde esta pantalla deben persistir en el backend del tenant.</li></ul>'
        })}
      </div>
      ${Section({
        title:'Catálogo de cuentas',
        subtitle:`${rows.length} cuentas visibles en este corte. ${state.accounting?.chartAccountsLoaded?'Fuente: backend tenant-scoped.':'Esperando sincronización con backend.'}`,
        children:DataTable({columns:[
          {key:'code',label:'Código',render:(row)=>`<span class="cg-ui-code">${safe(row.code)}</span>`},
          {key:'accountLabel',label:'Cuenta',render:(row)=>safe(row.accountLabel)},
          {key:'type',label:'Tipo',render:(row)=>safe(row.type)},
          {key:'nature',label:'Naturaleza',render:(row)=>safe(row.nature)},
          {key:'allowPosting',label:'Uso',render:(row)=>row.allowPosting?Badge('Movimiento','success'):Badge('Grupo','neutral')}
        ],rows,empty:'Sin cuentas configuradas'})
      })}
      ${Section({title:'Agregar cuenta personalizada',subtitle:'La creación se confirma primero en el servidor y sólo después aparece en la interfaz.',children:form})}
    </section>`;
  },
  mount(state,{Store,Toast,Loading}) {
    let loading=false;
    const load=async({silent=false}={})=>{
      if(loading)return;
      loading=true;
      try{
        if(!silent)Loading?.mount?.('Cargando plan de cuentas…');
        const accounts=await ChartAccountsService.list();
        Store.update((draft)=>{draft.accounting=draft.accounting||{};draft.accounting.chartAccounts=Array.isArray(accounts)?accounts:[];draft.accounting.chartAccountsLoaded=true;});
      }catch(error){
        if(!silent)Toast.show(`No se pudo cargar el plan de cuentas: ${error.message}`,'error');
      }finally{loading=false;if(!silent)Loading?.unmount?.();}
    };
    if(!state.accounting?.chartAccountsLoaded)load({silent:true});
    document.getElementById('btnRefreshAccounts')?.addEventListener('click',()=>load());
    document.getElementById('customAccountForm')?.addEventListener('submit',async(event)=>{
      event.preventDefault();
      const form=event.currentTarget;
      const submit=form.querySelector('[type="submit"]');
      const data=Object.fromEntries(new FormData(form).entries());
      submit?.setAttribute('disabled','disabled');
      try{
        const created=await ChartAccountsService.create({...data,level:String(data.code||'').split('.').filter(Boolean).length,allowPosting:true,active:true});
        Store.update((draft)=>{draft.accounting=draft.accounting||{};draft.accounting.chartAccounts=[...(draft.accounting.chartAccounts||[]).filter((item)=>item.id!==created.id&&item.code!==created.code),created].sort((a,b)=>String(a.code).localeCompare(String(b.code)));draft.accounting.chartAccountsLoaded=true;});
        form.reset();
        Toast.show('Cuenta contable guardada en el backend de la empresa activa.','success');
      }catch(error){Toast.show(`No se guardó la cuenta: ${error.message}`,'error');}
      finally{submit?.removeAttribute('disabled');}
    });
    document.getElementById('btnSyncAccountTemplate')?.addEventListener('click',async()=>{
      try{
        Loading?.mount?.('Sincronizando plantilla contable…');
        const result=await ChartAccountsService.syncTemplate();
        await load({silent:true});
        Toast.show(`${Number(result?.synced||0)} cuentas de plantilla sincronizadas para el tenant.`,'success');
      }catch(error){Toast.show(`No se sincronizó la plantilla: ${error.message}`,'error');}
      finally{Loading?.unmount?.();}
    });
    document.getElementById('btnExportAccountsTxt')?.addEventListener('click',()=>{
      const accounts=effectiveAccounts(Store.get());
      ExportService.downloadTxt('plan-cuentas-contagest',accounts,'Plan de Cuentas ContaGest-VE');
      Toast.show('TXT del plan de cuentas generado desde el catálogo visible.','success');
    });
    document.getElementById('btnExportAccountsXlsx')?.addEventListener('click',async()=>{
      const accounts=effectiveAccounts(Store.get());
      await ExportService.downloadXlsx('plan-cuentas-contagest',[{name:'Plan de Cuentas',rows:accounts}],'Plan de Cuentas ContaGest-VE');
      Toast.show('XLSX solicitado con el catálogo persistido disponible.','info');
    });
  }
};
