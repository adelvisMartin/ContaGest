import { PageHeader, Field, Select, Button, Badge, MetricGrid, EmptyState, ErpButton, ErpCard, ErpDataTable, ErpGrid, ErpRow, ErpSection } from '../components/ui/index.js';
import { bs, usd, shortDate } from '../core/formatters.js';
import { escapeHtml, mountSubmit, qsa, today } from '../utils/dom.js';
import { BankingService } from '../services/enterpriseOperationsService.js';
import { t } from '../i18n/useTranslate.js';

const safe=(value)=>escapeHtml(String(value??''));
const money=(currency,value)=>currency==='USD'?usd(value):bs(value);

export const BankingPage = {
  render(state,{query={}}={}) {
    const lang=state.settings?.lang||'es';
    const banking=state.banking||{accounts:[],movements:[]};
    const accounts=banking.accounts||[];
    const movements=banking.movements||[];
    const search=String(query.search||'').toLowerCase();
    const status=query.status||'all';
    const filtered=movements.filter((movement)=>{
      const account=accounts.find((item)=>item.id===movement.accountId)||{};
      const matches=!search||[movement.description,movement.reference,account.bank,account.account].some((value)=>String(value||'').toLowerCase().includes(search));
      return matches&&(status==='all'||(status==='reconciled'?movement.reconciled:!movement.reconciled));
    });
    const totalBs=accounts.filter((account)=>account.currency==='VES').reduce((sum,account)=>sum+Number(account.balance||0),0);
    const totalUsd=accounts.filter((account)=>account.currency==='USD').reduce((sum,account)=>sum+Number(account.balance||0),0);
    const pending=movements.filter((movement)=>!movement.reconciled).length;
    const reconciledPct=movements.length?Math.round(((movements.length-pending)/movements.length)*100):100;
    const accountOptions=accounts.map((account)=>({value:account.id,label:`${account.bank} · ${account.account} · ${account.currency}`}));

    const accountCards=accounts.map((account)=>ErpCard(`<div class="cg-ui-row"><span class="cgx-metric-icon"><i class="fa-solid fa-building-columns"></i></span><div class="cg-u-min-0"><p class="cg-ui-muted">${safe(account.bank)}</p><strong class="cg-ui-card-title cg-u-text-mono">${safe(money(account.currency,account.balance))}</strong><small>${safe(account.account)} · ${safe(account.type||'Cuenta bancaria')}</small></div></div>`,{tag:'article'})).join('');
    const table=ErpDataTable({
      caption:'Movimientos bancarios',
      columns:[
        {key:'date',label:t('date',lang),render:(movement)=>safe(shortDate(movement.date))},
        {key:'account',label:t('account',lang),render:(movement)=>{const account=accounts.find((item)=>item.id===movement.accountId)||{};return `<strong>${safe(account.bank||'-')}</strong><br><small>${safe(account.account||'')}</small>`;}},
        {key:'description',label:t('description',lang),render:(movement)=>safe(movement.description)},
        {key:'reference',label:t('reference',lang),render:(movement)=>safe(movement.reference||'—')},
        {key:'type',label:t('type',lang),render:(movement)=>Badge(movement.type==='income'?'Ingreso':'Egreso',movement.type==='income'?'success':'warning')},
        {key:'amount',label:t('amount',lang),numeric:true,render:(movement)=>safe(money(movement.currency,movement.amount))},
        {key:'status',label:t('status',lang),render:(movement)=>Badge(movement.reconciled?'Conciliado':'Pendiente',movement.reconciled?'success':'warning')},
        {key:'actions',label:t('actions',lang),render:(movement)=>ErpRow(ErpButton('Cambiar conciliación',{variant:'secondary',icon:'fa-solid fa-check-double',iconOnly:true,data:{'toggle-reconcile':movement.id}}),{wrap:true})}
      ],rows:filtered
    });

    const accountForm=`<form id="bankAccountForm" class="cg-ui-stack cg-ui-gap-sm">${Field({labelKey:'Banco',name:'bank',required:true})}${Field({labelKey:'Número de cuenta',name:'account',required:true})}${Select({labelKey:'Tipo',name:'type',options:['Corriente','Ahorro','Caja','Pasarela'].map((value)=>({value,label:value}))})}${Select({labelKey:'Moneda',name:'currency',options:[{value:'VES',label:'Bolívares'},{value:'USD',label:'Dólares'}]})}${Field({labelKey:'Saldo inicial',name:'openingBalance',type:'number',attrs:'step="0.01"',value:'0'})}${Button({text:'Crear cuenta',icon:'fa-plus',type:'submit'})}</form>`;
    const movementForm=`<form id="bankForm" class="cg-ui-stack cg-ui-gap-sm">${Field({labelKey:'Fecha',name:'date',type:'date',value:today()})}${Select({labelKey:'Cuenta',name:'accountId',options:accountOptions})}${Field({labelKey:'Descripción',name:'description',required:true})}${Field({labelKey:'Referencia',name:'reference'})}<div class="cg-ui-grid cg-ui-grid-two">${Select({labelKey:'Tipo',name:'type',options:[{value:'income',label:'Ingreso'},{value:'expense',label:'Egreso'}]})}${Select({labelKey:'Moneda',name:'currency',options:[{value:'VES',label:'VES'},{value:'USD',label:'USD'}]})}</div>${Field({labelKey:'Monto',name:'amount',type:'number',attrs:'step="0.01" min="0.01"',value:'0'})}${Button({text:'Registrar movimiento',icon:'fa-building-columns',type:'submit'})}</form>`;
    const toolbar=`<div class="cgx-toolbar"><strong>${filtered.length} movimientos</strong><label><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-query-param="search" value="${safe(query.search||'')}" placeholder="Buscar banco, referencia o descripción"></label><select class="select" data-query-param="status"><option value="all">Todos</option><option value="pending" ${status==='pending'?'selected':''}>Pendientes</option><option value="reconciled" ${status==='reconciled'?'selected':''}>Conciliados</option></select><button type="button" class="btn btn-secondary" data-query-clear="search,status">Limpiar</button></div>`;

    return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'bankingEyebrow',titleKey:'bankingTitle',descKey:'bankingDesc',actions:`${Button({id:'btnBankRefresh',text:t('refresh',lang),icon:'fa-rotate',variant:'secondary'})}${Button({id:'btnBankImport',text:'Importar extracto',icon:'fa-file-import',variant:'secondary'})}${Button({id:'btnBankExport',text:t('exportCsv',lang),icon:'fa-file-csv',variant:'secondary'})}`})}<input id="bankStatementFile" type="file" accept=".csv,text/csv" hidden>${MetricGrid([
      {label:'Saldo Bs',value:bs(totalBs),iconName:'fa-building-columns',tone:'neutral'},
      {label:'Saldo USD',value:usd(totalUsd),iconName:'fa-dollar-sign',tone:'brand'},
      {label:'Pendientes',value:String(pending),iconName:'fa-list-check',tone:pending?'warning':'success'},
      {label:'Conciliado',value:`${reconciledPct}%`,iconName:'fa-shield-check',tone:reconciledPct===100?'success':'brand'}
    ])}${accounts.length?ErpGrid(accountCards,{columns:'four'}):EmptyState({title:'Sin cuentas bancarias',description:'Registra la primera cuenta.',iconName:'fa-building-columns'})}<div class="cg-ui-grid cg-ui-grid-two">${ErpSection({title:'Nueva cuenta',description:'Saldo inicial y moneda de operación.',content:accountForm})}${ErpSection({title:'Nuevo movimiento',description:'El saldo se actualiza en una transacción auditable.',content:movementForm})}</div>${ErpSection({title:'Movimientos',description:'Los movimientos registrados no se eliminan desde la interfaz. Las correcciones financieras deben conservar trazabilidad mediante conciliación o un flujo de reverso/ajuste.',content:`${toolbar}${table}`})}</section>`;
  },
  mount(state,{Store,Toast,Loading}) {
    const load=async({silent=false}={})=>{try{if(!silent)Loading?.mount?.('Cargando bancos…');const summary=await BankingService.summary();Store.set({banking:{accounts:summary.accounts||[],movements:summary.movements||[]},bankingLoadedAt:new Date().toISOString()});}catch(error){Toast.show(`No se pudo cargar tesorería: ${error.message}`,'error');}finally{if(!silent)Loading?.unmount?.();}};
    if(!state.bankingLoadedAt)load({silent:true});
    document.getElementById('btnBankRefresh')?.addEventListener('click',()=>load());
    mountSubmit('#bankAccountForm',async(data,form)=>{const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');try{const account=await BankingService.createAccount(data);Store.update((draft)=>{draft.banking=draft.banking||{accounts:[],movements:[]};draft.banking.accounts=[account,...(draft.banking.accounts||[]).filter((item)=>item.id!==account.id)];});form.reset();Toast.show('Cuenta bancaria creada.','success');}catch(error){Toast.show(`No se creó la cuenta: ${error.message}`,'error');}finally{submit?.removeAttribute('disabled');}});
    mountSubmit('#bankForm',async(data,form)=>{if(!data.accountId)return Toast.show('Selecciona una cuenta.','error');const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');try{await BankingService.createMovement(data);form.reset();Toast.show('Movimiento registrado y saldo actualizado.','success');await load({silent:true});}catch(error){Toast.show(`No se registró el movimiento: ${error.message}`,'error');}finally{submit?.removeAttribute('disabled');}});
    qsa('[data-toggle-reconcile]').forEach((button)=>button.addEventListener('click',async()=>{const movement=(Store.get().banking?.movements||[]).find((item)=>item.id===button.dataset.toggleReconcile);if(!movement)return;try{const updated=await BankingService.reconcile(movement.id,!movement.reconciled);Store.update((draft)=>{draft.banking.movements=(draft.banking?.movements||[]).map((item)=>item.id===updated.id?updated:item);});Toast.show(updated.reconciled?'Movimiento conciliado.':'Conciliación revertida.','success');}catch(error){Toast.show(`No se actualizó la conciliación: ${error.message}`,'error');}}));
    const input=document.getElementById('bankStatementFile');
    document.getElementById('btnBankImport')?.addEventListener('click',()=>input?.click());
    input?.addEventListener('change',async()=>{const file=input.files?.[0];if(!file)return;try{const text=await file.text();const [header,...lines]=text.trim().split(/\r?\n/);const keys=header.split(',').map((key)=>key.trim());const accounts=Store.get().banking?.accounts||[];const candidates=lines.filter(Boolean).map((line)=>{const values=line.split(',').map((value)=>value.trim());const row=Object.fromEntries(keys.map((key,index)=>[key,values[index]||'']));const account=accounts.find((item)=>item.account===row.account)||accounts[0];return {date:row.date||today(),accountId:account?.id||'',description:row.description||'Movimiento importado',reference:row.reference||'',type:row.type==='expense'?'expense':'income',currency:row.currency||account?.currency||'VES',amount:Number(row.amount||0)};}).filter((row)=>row.accountId&&row.amount>0);if(!candidates.length)throw new Error('El extracto no contiene movimientos válidos.');Loading?.mount?.(`Importando ${candidates.length} movimientos…`);const results=[];for(const candidate of candidates){try{results.push(await BankingService.createMovement(candidate));}catch(error){results.push({error:error.message});}}const imported=results.filter((item)=>!item.error).length;const failed=results.length-imported;await load({silent:true});Toast.show(`${imported} movimientos importados${failed?`; ${failed} rechazados`:''}.`,failed?'warning':'success');}catch(error){Toast.show(`No se pudo importar: ${error.message}`,'error');}finally{Loading?.unmount?.();input.value='';}});
    document.getElementById('btnBankExport')?.addEventListener('click',()=>{const rows=Store.get().banking?.movements||[];const csv=['date,accountId,description,reference,type,currency,amount,reconciled',...rows.map((row)=>[row.date,row.accountId,JSON.stringify(row.description||''),row.reference||'',row.type,row.currency,row.amount,row.reconciled].join(','))].join('\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));link.download='movimientos-bancarios.csv';link.click();URL.revokeObjectURL(link.href);Toast.show('Extracto exportado.','success');});
  }
};
