import { PageHeader, Field, Select, Button, Table, Badge, StatCard, EmptyState } from '../components/ui/index.js';
import { bs, usd, shortDate } from '../core/formatters.js';
import { escapeHtml, mountSubmit, qsa, today } from '../utils/dom.js';
import { BankingService } from '../services/enterpriseOperationsService.js';

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
    const totalBs = accounts.filter((account)=>account.currency==='VES').reduce((sum,account)=>sum+Number(account.balance||0),0);
    const totalUsd = accounts.filter((account)=>account.currency==='USD').reduce((sum,account)=>sum+Number(account.balance||0),0);
    const pending = movements.filter((movement)=>!movement.reconciled).length;
    const reconciledPct = movements.length ? Math.round(((movements.length-pending)/movements.length)*100) : 100;
    const accountOptions = accounts.map((account)=>({value:account.id,label:`${account.bank} · ${account.account} · ${account.currency}`}));
    const rows = filtered.map((movement)=>{
      const account=accounts.find((item)=>item.id===movement.accountId)||{};
      return `<tr><td>${shortDate(movement.date)}</td><td><strong>${escapeHtml(account.bank||'-')}</strong><br><small>${escapeHtml(account.account||'')}</small></td><td>${escapeHtml(movement.description)}</td><td>${escapeHtml(movement.reference||'—')}</td><td>${Badge(movement.type==='income'?'Ingreso':'Egreso',movement.type==='income'?'success':'warning')}</td><td class="cg-cell-money">${movement.currency==='USD'?usd(movement.amount):bs(movement.amount)}</td><td>${Badge(movement.reconciled?'Conciliado':'Pendiente',movement.reconciled?'success':'warning')}</td><td><div class="cg-row-actions"><button class="btn btn-secondary !p-2" data-toggle-reconcile="${movement.id}" aria-label="Cambiar conciliación"><i class="fa-solid fa-check-double"></i></button><button class="btn btn-danger !p-2" data-delete-bank-movement="${movement.id}" aria-label="Eliminar"><i class="fa-solid fa-trash"></i></button></div></td></tr>`;
    });
    const accountCards = accounts.map((account)=>`<article class="cgx-metric"><div class="cgx-metric-icon"><i class="fa-solid fa-building-columns"></i></div><div><p>${escapeHtml(account.bank)}</p><strong>${account.currency==='USD'?usd(account.balance):bs(account.balance)}</strong><small>${escapeHtml(account.account)} · ${escapeHtml(account.type||'Cuenta bancaria')}</small></div></article>`).join('');

    return `<section class="cg-page-stack">
      ${PageHeader({eyebrow:'Tesorería',title:'Bancos y conciliación',description:'Cuentas, movimientos, extractos y conciliación con transacciones y auditoría.',actions:`${Button({id:'btnBankRefresh',text:'Actualizar',icon:'fa-rotate',variant:'secondary'})}${Button({id:'btnBankImport',text:'Importar extracto',icon:'fa-file-import',variant:'secondary'})}${Button({id:'btnBankExport',text:'Exportar CSV',icon:'fa-file-csv',variant:'secondary'})}`})}
      <input id="bankStatementFile" type="file" accept=".csv,text/csv" hidden>
      <div class="grid gap-3 md:grid-cols-4">${StatCard({label:'Saldo Bs',value:bs(totalBs),icon:'fa-building-columns'})}${StatCard({label:'Saldo USD',value:usd(totalUsd),icon:'fa-dollar-sign',tone:'accent'})}${StatCard({label:'Pendientes',value:String(pending),icon:'fa-list-check',tone:pending?'warning':'success'})}${StatCard({label:'Conciliado',value:`${reconciledPct}%`,icon:'fa-shield-check',tone:reconciledPct===100?'success':'brand'})}</div>
      <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">${accountCards || EmptyState({title:'Sin cuentas bancarias',description:'Registra la primera cuenta.',iconName:'fa-building-columns'})}</section>
      <div class="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div class="grid gap-4">
          <form id="bankAccountForm" class="cgx-section"><header class="cgx-section-head"><div><h2>Nueva cuenta</h2><p>Saldo inicial y moneda de operación.</p></div></header><div class="cgx-section-body grid gap-3">${Field({labelKey:'Banco',name:'bank',required:true})}${Field({labelKey:'Número de cuenta',name:'account',required:true})}${Select({labelKey:'Tipo',name:'type',options:['Corriente','Ahorro','Caja','Pasarela'].map((value)=>({value,label:value}))})}${Select({labelKey:'Moneda',name:'currency',options:[{value:'VES',label:'Bolívares'},{value:'USD',label:'Dólares'}]})}${Field({labelKey:'Saldo inicial',name:'openingBalance',type:'number',attrs:'step="0.01"',value:'0'})}${Button({text:'Crear cuenta',icon:'fa-plus',type:'submit'})}</div></form>
          <form id="bankForm" class="cgx-section"><header class="cgx-section-head"><div><h2>Nuevo movimiento</h2><p>El saldo se actualiza en una transacción.</p></div></header><div class="cgx-section-body grid gap-3">${Field({labelKey:'Fecha',name:'date',type:'date',value:today()})}${Select({labelKey:'Cuenta',name:'accountId',options:accountOptions})}${Field({labelKey:'Descripción',name:'description',required:true})}${Field({labelKey:'Referencia',name:'reference'})}<div class="grid grid-cols-2 gap-3">${Select({labelKey:'Tipo',name:'type',options:[{value:'income',label:'Ingreso'},{value:'expense',label:'Egreso'}]})}${Select({labelKey:'Moneda',name:'currency',options:[{value:'VES',label:'VES'},{value:'USD',label:'USD'}]})}</div>${Field({labelKey:'Monto',name:'amount',type:'number',attrs:'step="0.01" min="0.01"',value:'0'})}${Button({text:'Registrar movimiento',icon:'fa-building-columns',type:'submit'})}</div></form>
        </div>
        <section class="cgx-section"><header class="cgx-section-head"><div><h2>Movimientos</h2><p>Conciliación auditada e importación controlada.</p></div></header><div class="cgx-section-body"><div class="cgx-toolbar"><strong>${filtered.length} movimientos</strong><label><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-query-param="search" value="${escapeHtml(query.search||'')}" placeholder="Buscar banco, referencia o descripción"></label><select class="select" data-query-param="status"><option value="all">Todos</option><option value="pending" ${status==='pending'?'selected':''}>Pendientes</option><option value="reconciled" ${status==='reconciled'?'selected':''}>Conciliados</option></select><button type="button" class="btn btn-secondary" data-query-clear="search,status">Limpiar</button></div>${Table({headers:[{label:'Fecha'},{label:'Cuenta'},{label:'Descripción'},{label:'Referencia'},{label:'Tipo'},{label:'Monto'},{label:'Estado'},{label:'Acciones'}],rows})}</div></section>
      </div>
    </section>`;
  },
  mount(state,{Store,Toast,Loading}) {
    const load=async({silent=false}={})=>{
      try{
        if(!silent)Loading?.mount?.('Cargando bancos…');
        const summary=await BankingService.summary();
        Store.set({banking:{accounts:summary.accounts||[],movements:summary.movements||[]},bankingLoadedAt:new Date().toISOString()});
      }catch(error){Toast.show(`No se pudo cargar tesorería: ${error.message}`,'error');}
      finally{if(!silent)Loading?.unmount?.();}
    };
    if(!state.bankingLoadedAt)load({silent:true});
    document.getElementById('btnBankRefresh')?.addEventListener('click',()=>load());
    mountSubmit('#bankAccountForm',async(data,form)=>{
      const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');
      try{const account=await BankingService.createAccount(data);Store.update((draft)=>{draft.banking=draft.banking||{accounts:[],movements:[]};draft.banking.accounts=[account,...(draft.banking.accounts||[]).filter((item)=>item.id!==account.id)];});form.reset();Toast.show('Cuenta bancaria creada.','success');}
      catch(error){Toast.show(`No se creó la cuenta: ${error.message}`,'error');}
      finally{submit?.removeAttribute('disabled');}
    });
    mountSubmit('#bankForm',async(data,form)=>{
      if(!data.accountId)return Toast.show('Selecciona una cuenta.','error');
      const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');
      try{await BankingService.createMovement(data);form.reset();Toast.show('Movimiento registrado y saldo actualizado.','success');await load({silent:true});}
      catch(error){Toast.show(`No se registró el movimiento: ${error.message}`,'error');}
      finally{submit?.removeAttribute('disabled');}
    });
    qsa('[data-toggle-reconcile]').forEach((button)=>button.addEventListener('click',async()=>{
      const movement=(Store.get().banking?.movements||[]).find((item)=>item.id===button.dataset.toggleReconcile);if(!movement)return;
      try{const updated=await BankingService.reconcile(movement.id,!movement.reconciled);Store.update((draft)=>{draft.banking.movements=(draft.banking?.movements||[]).map((item)=>item.id===updated.id?updated:item);});Toast.show(updated.reconciled?'Movimiento conciliado.':'Conciliación revertida.','success');}
      catch(error){Toast.show(`No se actualizó la conciliación: ${error.message}`,'error');}
    }));
    qsa('[data-delete-bank-movement]').forEach((button)=>button.addEventListener('click',async()=>{
      try{await BankingService.removeMovement(button.dataset.deleteBankMovement);Toast.show('Movimiento eliminado y saldo revertido.','success');await load({silent:true});}
      catch(error){Toast.show(`No se eliminó el movimiento: ${error.message}`,'error');}
    }));
    const input=document.getElementById('bankStatementFile');
    document.getElementById('btnBankImport')?.addEventListener('click',()=>input?.click());
    input?.addEventListener('change',async()=>{
      const file=input.files?.[0];if(!file)return;
      try{
        const text=await file.text();const [header,...lines]=text.trim().split(/\r?\n/);const keys=header.split(',').map((key)=>key.trim());const accounts=Store.get().banking?.accounts||[];
        const candidates=lines.filter(Boolean).map((line)=>{const values=line.split(',').map((value)=>value.trim());const row=Object.fromEntries(keys.map((key,index)=>[key,values[index]||'']));const account=accounts.find((item)=>item.account===row.account)||accounts[0];return {date:row.date||today(),accountId:account?.id||'',description:row.description||'Movimiento importado',reference:row.reference||'',type:row.type==='expense'?'expense':'income',currency:row.currency||account?.currency||'VES',amount:Number(row.amount||0)};}).filter((row)=>row.accountId&&row.amount>0);
        if(!candidates.length)throw new Error('El extracto no contiene movimientos válidos.');
        Loading?.mount?.(`Importando ${candidates.length} movimientos…`);
        const results=[];for(const candidate of candidates){try{results.push(await BankingService.createMovement(candidate));}catch(error){results.push({error:error.message});}}
        const imported=results.filter((item)=>!item.error).length;const failed=results.length-imported;await load({silent:true});Toast.show(`${imported} movimientos importados${failed?`; ${failed} rechazados`:''}.`,failed?'warning':'success');
      }catch(error){Toast.show(`No se pudo importar: ${error.message}`,'error');}
      finally{Loading?.unmount?.();input.value='';}
    });
    document.getElementById('btnBankExport')?.addEventListener('click',()=>{
      const rows=Store.get().banking?.movements||[];const csv=['date,accountId,description,reference,type,currency,amount,reconciled',...rows.map((row)=>[row.date,row.accountId,JSON.stringify(row.description||''),row.reference||'',row.type,row.currency,row.amount,row.reconciled].join(','))].join('\n');
      const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));link.download='movimientos-bancarios.csv';link.click();URL.revokeObjectURL(link.href);Toast.show('Extracto exportado.','success');
    });
  }
};
