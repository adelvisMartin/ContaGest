import { PageHeader, Badge } from '../components/ui/index.js';
import { ORDER_RULES, INVENTORY_RULES, ACCOUNTING_RULES, PAYROLL_RULES, PAYMENT_RULES } from '../core/businessRules.js';

const block = (title, icon, rules) => `<article class="surface p-5 rounded-[1.5rem]"><h3 class="text-2xl font-black"><i class="fa-solid ${icon} text-[#1e3a8a]"></i> ${title}</h3><div class="mt-4 grid gap-2">${Object.entries(rules).map(([k,v]) => `<div class="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><strong>${k}</strong>${Badge(String(v), 'brand')}</div>`).join('')}</div></article>`;

export const BusinessRulesPage = {
  render() {
    return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'businessRulesEyebrow', titleKey:'businessRulesTitle', descKey:'businessRulesDesc'})}<div class="grid gap-5 xl:grid-cols-2">${block('Pedidos', 'fa-bell-concierge', ORDER_RULES)}${block('Inventario / Kardex', 'fa-boxes-stacked', INVENTORY_RULES)}${block('Contabilidad', 'fa-scale-balanced', ACCOUNTING_RULES)}${block('Nómina', 'fa-users-gear', PAYROLL_RULES)}${block('Pagos', 'fa-credit-card', PAYMENT_RULES)}</div></section>`;
  }
};
