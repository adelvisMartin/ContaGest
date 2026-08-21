import { PageHeader, MetricGrid, Section, DataTable, Button, Field, Select, Badge } from '../components/ui/index.js';
import { uid, escapeHtml } from '../utils/dom.js';
import { CHART_OF_ACCOUNTS, ACCOUNTING_POLICIES } from '../data/chartOfAccounts.js';
import { JournalTemplates } from '../core/accountingEngine.js';
import { ExportService } from '../services/exportService.js';

const safe=(value)=>escapeHtml(String(value??''));

export const ChartAccountsPage = {
  render(state) {
    const allAccounts=[...CHART_OF_ACCOUNTS,...(state.customAccounts||[])];
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
      ${Field({labelKey:'Código',name:'code',placeholder:'1.1.01',required:true})}
      ${Field({labelKey:'Nombre de cuenta',name:'name',placeholder:'Caja principal',required:true,className:'cg-form-span'})}
      ${Select({labelKey:'Tipo',name:'type',options:['activo','pasivo','patrimonio','ingreso','costo','gasto'].map((value)=>({value,label:value[0].toUpperCase()+value.slice(1)}))})}
      ${Select({labelKey:'Naturaleza',name:'nature',options:[{value:'debit',label:'Débito'},{value:'credit',label:'Crédito'}]})}
      </div><div class="cg-record-actions">${Button({text:'Agregar cuenta',icon:'fa-plus',type:'submit'})}</div></form>`;

    return `<section class="cgx-page cg-page-stack accounting-chart-page">
      ${PageHeader({
        eyebrow:'Contabilidad',
        title:'Plan de Cuentas VEN-NIF configurable',
        description:ACCOUNTING_POLICIES.warning,
        actions:`${Button({id:'btnExportAccountsXlsx',text:'XLSX',icon:'fa-file-excel'})}${Button({id:'btnExportAccountsTxt',text:'TXT',icon:'fa-file-lines',variant:'secondary'})}`
      })}
      ${MetricGrid([
        {label:'Cuentas',value:String(k.total),hint:'Catálogo base y personalizado',iconName:'fa-sitemap',tone:'brand'},
        {label:'Imputables',value:String(k.postable),hint:'Permiten asientos',iconName:'fa-pen-nib',tone:'success'},
        {label:'Activos',value:String(k.assets),hint:'Cuentas de débito',iconName:'fa-building-columns',tone:'neutral'},
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
          children:'<ul class="cg-accounting-policy-list"><li>Cierres por período para impedir edición histórica.</li><li>Reversos en vez de eliminación.</li><li>Plantillas por fuente: ventas, compras, nómina, bancos e impuestos.</li><li>Personalizable por contador autorizado.</li></ul>'
        })}
      </div>
      ${Section({
        title:'Catálogo de cuentas',
        subtitle:`${rows.length} cuentas visibles en este corte.`,
        children:DataTable({columns:[
          {key:'code',label:'Código',render:(row)=>`<span class="cg-ui-code">${safe(row.code)}</span>`},
          {key:'accountLabel',label:'Cuenta',render:(row)=>safe(row.accountLabel)},
          {key:'type',label:'Tipo',render:(row)=>safe(row.type)},
          {key:'nature',label:'Naturaleza',render:(row)=>safe(row.nature)},
          {key:'allowPosting',label:'Uso',render:(row)=>row.allowPosting?Badge('Movimiento','success'):Badge('Grupo','neutral')}
        ],rows,empty:'Sin cuentas configuradas'})
      })}
      ${Section({title:'Agregar cuenta personalizada',subtitle:'Las cuentas personalizadas heredan la misma jerarquía y reglas de registro.',children:form})}
    </section>`;
  },
  mount(_state,{Store,Toast}) {
    document.getElementById('customAccountForm')?.addEventListener('submit',(event)=>{
      event.preventDefault();
      const data=Object.fromEntries(new FormData(event.currentTarget).entries());
      Store.update((draft)=>{draft.customAccounts=[{id:uid('acc'),...data,level:String(data.code||'').split('.').length,allowPosting:true,active:true},...(draft.customAccounts||[])];});
      event.currentTarget.reset();
      Toast.show('Cuenta contable agregada al catálogo configurable.','success');
    });
    document.getElementById('btnExportAccountsTxt')?.addEventListener('click',()=>{
      ExportService.downloadTxt('plan-cuentas-contagest',CHART_OF_ACCOUNTS,'Plan de Cuentas ContaGest-VE');
      Toast.show('TXT del plan de cuentas generado.','success');
    });
    document.getElementById('btnExportAccountsXlsx')?.addEventListener('click',async()=>{
      await ExportService.downloadXlsx('plan-cuentas-contagest',[{name:'Plan de Cuentas',rows:CHART_OF_ACCOUNTS}],'Plan de Cuentas ContaGest-VE');
      Toast.show('XLSX solicitado al backend. Si no está activo, se genera fallback.','info');
    });
  }
};
