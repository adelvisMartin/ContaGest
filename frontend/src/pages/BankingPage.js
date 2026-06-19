import { PageHeader, Field, Select, Button, Table, Badge, StatCard } from '../components/ui/index.js';
import { bs, usd, shortDate } from '../core/formatters.js';
import { escapeHtml, mountSubmit, qsa, uid, today } from '../utils/dom.js';

export const BankingPage = {
  render(state) {
    const totalBs = state.banking.accounts.filter((a) => a.currency === 'VES').reduce((s,a) => s + Number(a.balance||0), 0);
    const totalUsd = state.banking.accounts.filter((a) => a.currency === 'USD').reduce((s,a) => s + Number(a.balance||0), 0);
    const pending = state.banking.movements.filter((m) => !m.reconciled).length;
    const accountOptions = state.banking.accounts.map((a) => ({ value:a.id, label:`${a.bank} · ${a.account} · ${a.currency}` }));
    const rows = state.banking.movements.map((m) => { const account = state.banking.accounts.find((a) => a.id === m.accountId) || {}; return `<tr><td>${shortDate(m.date)}</td><td>${escapeHtml(account.bank || '-')}</td><td>${escapeHtml(m.description)}</td><td>${m.type === 'income' ? 'Ingreso' : 'Egreso'}</td><td>${m.currency === 'USD' ? usd(m.amount) : bs(m.amount)}</td><td>${Badge(m.reconciled ? 'Conciliado' : 'Pendiente', m.reconciled ? 'success' : 'warning')}</td><td><button class="btn btn-secondary !p-2" data-toggle-reconcile="${m.id}"><i class="fa-solid fa-check-double"></i></button></td></tr>`; });
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">${PageHeader({ eyebrowKey:'bankingEyebrow', titleKey:'bankingTitle', descKey:'bankingDesc' })}
      <div class="mb-5 grid gap-4 md:grid-cols-3">${StatCard({label:'Saldo Bs', value:bs(totalBs), icon:'fa-building-columns'})}${StatCard({label:'Saldo USD', value:usd(totalUsd), icon:'fa-dollar-sign', tone:'accent'})}${StatCard({label:'Pendientes', value:String(pending), icon:'fa-list-check'})}</div>
      <div class="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <form id="bankForm" class="panel-soft grid gap-4 rounded-[1.5rem] p-4 sm:grid-cols-2">
          ${Field({ labelKey:'date', name:'date', type:'date', value:today() })}${Select({ labelKey:'bank', name:'accountId', options:accountOptions })}${Field({ labelKey:'description', name:'description', required:true, className:'sm:col-span-2' })}${Select({ labelKey:'type', name:'type', options:[{value:'income',label:'Ingreso'}, {value:'expense',label:'Egreso'}] })}${Select({ labelKey:'currency', name:'currency', options:[{value:'VES',label:'VES'}, {value:'USD',label:'USD'}] })}${Field({ labelKey:'amount', name:'amount', type:'number', attrs:'step="0.01"', value:'0' })}<div class="sm:col-span-2">${Button({ text:'Agregar movimiento', i18n:'add', icon:'fa-building-columns' })}</div>
        </form>
        <div class="panel-soft rounded-[1.5rem] p-4">${Table({ headers:[{key:'date'}, {key:'bank'}, {key:'description'}, {key:'type'}, {key:'amount'}, {key:'status'}, {key:'actions'}], rows })}</div>
      </div>
    </section>`;
  },
  mount(state, { Store, Toast }) {
    mountSubmit('#bankForm', (data, form) => { Store.update((draft) => { const amount = Number(data.amount || 0); draft.banking.movements.unshift({ id:uid('mov'), ...data, amount, reconciled:false }); const account = draft.banking.accounts.find((item) => item.id === data.accountId); if (account) account.balance += data.type === 'income' ? amount : -amount; }); form.reset(); Toast.show('Movimiento bancario registrado.', 'success'); });
    qsa('[data-toggle-reconcile]').forEach((button) => button.addEventListener('click', () => Store.update((draft) => { const movement = draft.banking.movements.find((item) => item.id === button.dataset.toggleReconcile); if (movement) movement.reconciled = !movement.reconciled; })));
  }
};
