import { PageHeader, MetricGrid, Section, DataTable, Button, Field, Select, Badge } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';
import { CHART_OF_ACCOUNTS, ACCOUNTING_POLICIES } from '../data/chartOfAccounts.js';
import { JournalTemplates } from '../core/accountingEngine.js';
import { ExportService } from '../services/exportService.js';
import { ChartAccountsService } from '../services/chartAccountsService.js';

const safe=(value)=>escapeHtml(String(value??''));
const SEMANTIC_ROLES=[
  ['ar','Cuentas por cobrar'],['ap','Cuentas por pagar'],['vat_output','IVA débito fiscal'],
  ['vat_input','IVA crédito fiscal'],['withholding_payable','Retenciones por pagar'],
  ['payroll_payable','Nómina por pagar'],['tax_payable','Tributos por pagar'],
  ['cash','Caja'],['bank','Banco'],['revenue','Ingresos'],['expense','Gastos'],
  ['inventory','Inventario'],['asset','Activos'],['cost_of_sales','Costo de ventas']
];
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
    const accounting=state.accounting||{};
    const mappings=Array.isArray(accounting.roleMappings)?accounting.roleMappings:[];
    const boundRoles=new Set(mappings.map((mapping)=>mapping.role));
    const availableRoles=SEMANTIC_ROLES.filter(([role])=>!boundRoles.has(role));
    // A local template is not proof that an account exists in this tenant.
    const postableAccounts=accounting.chartAccountsLoaded&&Array.isArray(accounting.chartAccounts)
      ?accounting.chartAccounts.filter((account)=>account.active===true&&account.allowPosting===true):[];
    const canBind=accounting.roleMappingsLoaded&&accounting.chartAccountsLoaded
      &&availableRoles.length>0&&postableAccounts.length>0;
    const mappingStatus=accounting.roleMappingsError
      ?`<p role="alert">No se pudieron cargar las vinculaciones: ${safe(accounting.roleMappingsError)}</p>`
      :!accounting.roleMappingsLoaded?'<p role="status">Cargando vinculaciones contables…</p>'
      :mappings.length===0?'<p>Sin roles vinculados a cuentas contables.</p>':'';
    const mappingForm=`<form id="semanticRoleForm" class="cg-record-form"><div class="cg-record-fields">
      ${Select({labelKey:'Rol contable',name:'role',options:availableRoles.map(([value,label])=>({value,label})),attrs:canBind?'required':'disabled'})}
      ${Select({labelKey:'Cuenta imputable del tenant',name:'accountCode',options:postableAccounts.map((account)=>({value:account.code,label:`${account.code} · ${account.name}`})),attrs:canBind?'required':'disabled'})}
      </div><div class="cg-record-actions">${Button({text:'Vincular rol en servidor',icon:'fa-link',type:'submit',attrs:canBind?'':'disabled'})}</div>
      <p>Los vínculos confirmados son inmutables; una corrección requiere revisión contable y auditoría.</p></form>`;

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
      ${Section({
        title:'Roles contables semánticos',
        subtitle:'Vinculaciones autorizadas y persistidas para la empresa activa. No se utilizan cuentas de la plantilla local.',
        children:`${mappingStatus}${accounting.roleMappingsLoaded?DataTable({columns:[
          {key:'role',label:'Rol contable',render:(mapping)=>safe(SEMANTIC_ROLES.find(([role])=>role===mapping.role)?.[1]||mapping.role)},
          {key:'accountCode',label:'Cuenta vinculada',render:(mapping)=>safe(`${mapping.accountCode} · ${accounting.chartAccounts?.find((account)=>account.code===mapping.accountCode)?.name||'Cuenta del tenant'}`)},
          {key:'nature',label:'Naturaleza',render:(mapping)=>safe(mapping.nature)}
        ],rows:mappings,empty:'Sin roles vinculados'}):''}${mappingForm}`
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
    let loadingRoles=false;
    const loadRoles=async()=>{
      if(loadingRoles)return;
      loadingRoles=true;
      try{
        const mappings=await ChartAccountsService.listRoleMappings();
        Store.update((draft)=>{
          draft.accounting=draft.accounting||{};
          draft.accounting.roleMappings=Array.isArray(mappings)?mappings:[];
          draft.accounting.roleMappingsLoaded=true;
          draft.accounting.roleMappingsError=null;
        });
      }catch(error){
        Store.update((draft)=>{
          draft.accounting=draft.accounting||{};
          draft.accounting.roleMappingsError=error.message||'Error de acceso';
          draft.accounting.roleMappingsLoaded=false;
        });
      }finally{loadingRoles=false;}
    };
    if(!state.accounting?.chartAccountsLoaded)load({silent:true});
    if(!state.accounting?.roleMappingsLoaded&&!state.accounting?.roleMappingsError)loadRoles();
    document.getElementById('btnRefreshAccounts')?.addEventListener('click',async()=>{await Promise.all([load(),loadRoles()]);});
    document.getElementById('semanticRoleForm')?.addEventListener('submit',async(event)=>{
      event.preventDefault();
      const form=event.currentTarget;
      const submit=form.querySelector('[type="submit"]');
      const data=Object.fromEntries(new FormData(form).entries());
      const current=Store.get().accounting||{};
      if(!current.chartAccountsLoaded||!current.roleMappingsLoaded)return;
      const account=current.chartAccounts?.find((item)=>item.code===data.accountCode&&item.active===true&&item.allowPosting===true);
      if(!account||!SEMANTIC_ROLES.some(([role])=>role===data.role)||current.roleMappings?.some((item)=>item.role===data.role)){
        Toast.show('La cuenta o el rol ya no están disponibles; actualice los datos.','error');
        return;
      }
      submit?.setAttribute('disabled','disabled');
      try{
        const confirmed=await ChartAccountsService.bindRoleMapping({role:data.role,accountCode:data.accountCode});
        Store.update((draft)=>{
          draft.accounting=draft.accounting||{};
          draft.accounting.roleMappings=[...(draft.accounting.roleMappings||[]).filter((item)=>item.role!==confirmed.role),confirmed];
          draft.accounting.roleMappingsLoaded=true;
          draft.accounting.roleMappingsError=null;
        });
        Toast.show('Vinculación contable guardada en el servidor.','success');
      }catch(error){Toast.show(`No se pudo vincular el rol: ${error.message}`,'error');}
      finally{submit?.removeAttribute('disabled');}
    });
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
