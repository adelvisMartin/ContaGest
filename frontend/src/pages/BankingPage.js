import { PageHeader, Field, Select, Button, Table, Badge, StatCard, EmptyState } from '../components/ui/index.js';
import { bs, usd, shortDate } from '../core/formatters.js';
import { escapeHtml, mountSubmit, qsa, uid, today } from '../utils/dom.js';

const amountFor = (movement) => (movement.type === 'income' ? 1 : -1) * Number(movement.amount || 0);
const accountBalance = (account, movements) => Number(account.openingBalance ?? account.balance ?? 0) + movements.filter((movement)=>movement.accountId===account.id).reduce((sum,movement)=>sum+amountFor(movement),0);

export const BankingPage = {
  render(state, { query = {} } = {}) {
    const banking = state.banking || { accounts:[], movements:[] };
    const accounts = banking.accounts || [];
    const movements = banking.movements || [];
    const search = String(query.search || '').toLowerCase();
    const status = query.status || 'all';
    const filtered = movements.filter((movement)=>{
      const account=accounts.find((item)=>item.id===movement.accountId)||{};
      const matches=!search || [movement.description,movement.reference,account.bank,account.account].some((value)=>String(value||'').toLowerCase().includes(search));
      const statusMatches=status==='all' || (status==='reconciled' ? movement.reconciled : !movement.reconciled);
      return matches && statusMatches;
    });
    const balances = accounts.map((account)=>({ ...account, computedBalance:accountBalance(account,movements) }));
    const totalBs = balances.filter((account)=>account.currency==='VES').reduce((sum,account)=>sum+account.computedBalance,0);
    const totalUsd = balances.filter((account)=>account.currency==='USD').reduce((sum,account)=>sum+account.computedBalance,0);
    const pending = movements.filter((movement)=>!movement.reconciled).length;
    const reconciledPct = movements.length ? Math.round(((movements.length-pending)/movements.length)*100) : 100;
    const accountOptions = accounts.map((account)=>({value:account.id,label:`${account.bank} · ${account.account} · ${account.currency}`}));
    const rows = filtered.map((movement)=>{
      const account=accounts.find((item)=>item.id===movement.accountId)||{};
      return `<tr><td>${shortDate(movement.date)}</td><td><strong>${escapeHtml(account.bank||'-')}</strong><br><small>${escapeHtml(account.account||'')}</small></td><td>${escapeHtml(movement.description)}</td><td>${escapeHtml(movement.reference||'—')}</td><td>${Badge(movement.type==='income'?'Ingreso':'Egreso',movement.type==='income'?'success':'warning')}</td><td class="cg-cell-money">${movement.currency==='USD'?usd(movement.amount):bs(movement.amount)}</td><td>${Badge(movement.reconciled?'Conciliado':'Pendiente',movement.reconciled?'success':'warning')}</td><td><div class="cg-row-actions"><button class="btn btn-secondary !p-2" data-toggle-reconcile="${movement.id}" aria-label="Cambiar conciliación"><i class="fa-solid fa-check-double"></i></button><button class="btn btn-danger !p-2" data-delete-bank-movement="${movement.id}" aria-label="Eliminar"><i class="fa-solid fa-trash"></i></button></div></td></tr>`;
    });
    const accountCards = balances.map((account)=>`<article class="cgx-metric"><div class="cgx-metric-icon"><i class="fa-solid fa-building-columns"></i></div><div><p>${escapeHtml(account.bank)}</p><strong>${account.currency==='USD'?usd(account.computedBalance):bs(account.computedBalance)}</strong><small>${escapeHtml(account.account)} · ${escapeHtml(account.type||'Cuenta bancaria')}</small></div></article>`).join('');

    return `<section class="cg-page-stack">
      ${PageHeader({eyebrow:'Tesorería',title:'Bancos y conciliación',description:'Cuentas, movimientos, extractos y conciliación con trazabilidad.',actions:`${Button({id:'btnBankImport',text:'Importar extracto',icon:'fa-file-import',variant:'secondary'})}${Button({id:'btnBankExport',text:'Exportar CSV',icon:'fa-file-csv',variant:'secondary'})}`})}
      <input id="bankStatementFile" type="file" accept=".csv,text/csv" hidden>
      <div class="grid gap-3 md:grid-cols-4">${StatCard({label:'Saldo Bs',value:bs(totalBs),icon:'fa-building-columns'})}${StatCard({label:'Saldo USD',value:usd(totalUsd),icon:'fa-dollar-sign',tone:'accent'})}${StatCard({label:'Pendientes',value:String(pending),icon:'fa-list-check',tone:pending?'warning':'success'})}${StatCard({label:'Conciliado',value:`${reconciledPct}%`,icon:'fa-shield-check',tone:reconciledPct===100?'success':'brand'})}</div>
      <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">${accountCards || EmptyState({title:'Sin cuentas bancarias',description:'Registra la primera cuenta.',iconName:'fa-building-columns'})}</section>
      <div class="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div class="grid gap-4">
          <form id="bankAccountForm" class="cgx-section"><header class="cgx-section-head"><div><h2>Nueva cuenta</h2><p>Saldo inicial y moneda de operación.</p></div></header><div class="cgx-section-body grid gap-3">${Field({labelKey:'Banco',name:'bank',required:true})}${Field({labelKey:'Número de cuenta',name:'account',required:true})}${Select({labelKey:'Tipo',name:'type',options:['Corriente','Ahorro','Caja','Pasarela'].map((value)=>({value,label:value}))})}${Select({labelKey:'Moneda',name:'currency',options:[{value:'VES',label:'Bolívares'},{value:'USD',label:'Dólares'}]})${Field({labelKey:'Saldo inicial',name:'openingBalance',type:'number',attrs:'step="0.01"',value:'0'})}${Button({text:'Crear cuenta',icon:'fa-plus',type:'submit'})}</div></form>
          <form id="bankForm" class="cgx-section"><header class="cgx-section-head"><div><h2>Nuevo movimiento</h2><p>Registra la operación antes de conciliar.</p></div></header><div class="cgx-section-body grid gap-3">${Field({labelKey:'Fecha',name:'date',type:'date',value:today()})}${Select({labelKey:'Cuenta',name:'accountId',options:accountOptions})}${Field({labelKey:'Descripción',name:'description',required:true})}${Field({labelKey:'Referencia',name:'reference'})}<div class="grid grid-cols-2 gap-3">${Select({labelKey:'Tipo',name:'type',options:[{value:'income',label:'Ingreso'},{value:'expense',label:'Egreso'}]})}${Select({labelKey:'Moneda',name:'currency',options:[{value:'VES',label:'VES'},{value:'USD',label:'USD'}]})}</div>${Field({labelKey:'Monto',name:'amount',type:'number',attrs:'step="0.01" min="0.01"',value:'0'})}${Button({text:'Registrar movimiento',icon:'fa-building-columns',type:'submit'})}</div></form>
        </div>
        <section class="cgx-section"><header class="cgx-section-head"><div><h2>Movimientos</h2><p>Conciliación individual e importación de extractos.</p></div></header><div class="cgx-section-body"><div class="cgx-toolbar"><strong>${filtered.length} movimientos</strong><label><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-query-param="search" value="${escapeHtml(query.search||'')}" placeholder="Buscar banco, referencia o descripción"></label><select class="select" data-query-param="status"><option value="all">Todos</option><option value="pending" ${status==='pending'?'selected':''}>Pendientes</option><option value="reconciled" ${status==='reconciled'?'selected':''}>Conciliados</option></select><button type="button" class="btn btn-secondary" data-query-clear="search,status">Limpiar</button></div>${Table({headers:[{label:'Fecha'},{label:'Cuenta'},{label:'Descripción'},{label:'Referencia'},{label:'Tipo'},{label:'Monto'},{label:'Estado'},{label:'Acciones'}],rows})}</div></section>
      </div>
    </section>`;
  },
  mount(state,{Store,Toast}) {
    mountSubmit('#bankAccountForm',(data,form)=>{
      Store.update((draft)=>{draft.banking=draft.banking||{accounts:[],movements:[]};draft.banking.accounts.push({id:uid('bank'),...data,openingBalance:Number(data.openingBalance||0),balance:0});});
      form.reset();Toast.show('Cuenta bancaria creada.','success');
    });
    mountSubmit('#bankForm',(data,form)=>{
      if(!data.accountId)return Toast.show('Selecciona una cuenta.','error');
      Store.update((draft)=>{draft.banking=draft.banking||{accounts:[],movements:[]};draft.banking.movements.unshift({id:uid('mov'),...data,amount:Number(data.amount||0),reconciled:false,createdAt:new Date().toISOString()});});
      form.reset();Toast.show('Movimiento registrado.','success');
    });
    qsa('[data-toggle-reconcile]').forEach((button)=>button.addEventListener('click',()=>Store.update((draft)=>{const movement=(draft.banking?.movements||[]).find((item)=>item.id===button.dataset.toggleReconcile);if(movement){movement.reconciled=!movement.reconciled;movement.reconciledAt=movement.reconciled?new Date().toISOString():null;}})));
    qsa('[data-delete-bank-movement]').forEach((button)=>button.addEventListener('click',()=>Store.update((draft)=>{draft.banking.movements=(draft.banking?.movements||[]).filter((item)=>item.id!==button.dataset.deleteBankMovement);})));
    const input=document.getElementById('bankStatementFile');
    document.getElementById('btnBankImport')?.addEventListener('click',()=>input?.click());
    input?.addEventListener('change',async()=>{
      const file=input.files?.[0];if(!file)return;
      try{
        const text=await file.text();
        const [header,...lines]=text.trim().split(/\r?\n/);
        const keys=header.split(',').map((key)=>key.trim());
        const accounts=Store.get().banking?.accounts||[];
        const imported=lines.filter(Boolean).map((line)=>{const values=line.split(',').map((value)=>value.trim());const row=Object.fromEntries(keys.map((key,index)=>[key,values[index]||'']));const account=accounts.find((item)=>item.account===row.account)||accounts[0];return {id:uid('mov'),date:row.date||today(),accountId:account?.id||'',description:row.description||'Movimiento importado',reference:row.reference||'',type:row.type==='expense'?'expense':'income',currency:row.currency||account?.currency||'VES',amount:Number(row.amount||0),reconciled:false,source:'statement',createdAt:new Date().toISOString()};}).filter((row)=>row.accountId&&row.amount>0);
        Store.update((draft)=>{draft.banking.movements=[...imported,...(draft.banking?.movements||[])];});
        Toast.show(`${imported.length} movimientos importados. Revisa y concilia.`, 'success');
      }catch(error){Toast.show(`No se pudo importar: ${error.message}`,'error');}finally{input.value='';}
    });
    document.getElementById('btnBankExport')?.addEventListener('click',()=>{
      const rows=Store.get().banking?.movements||[];
      const csv=['date,accountId,description,reference,type,currency,amount,reconciled',...rows.map((row)=>[row.date,row.accountId,JSON.stringify(row.description||''),row.reference||'',row.type,row.currency,row.amount,row.reconciled].join(','))].join('\n');
      const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));link.download='movimientos-bancarios.csv';link.click();URL.revokeObjectURL(link.href);
      Toast.show('Extracto exportado.','success');
    });
  }
};
