import { PageHeader, Badge, ErpGrid, ErpSection, ErpStack } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';
import { ORDER_RULES, INVENTORY_RULES, ACCOUNTING_RULES, PAYROLL_RULES, PAYMENT_RULES } from '../core/businessRules.js';
import { ApprovalsPage } from './ApprovalsPage.js';

const safe = (value) => escapeHtml(String(value ?? ''));

const block = (title, icon, rules) => ErpSection({
  tag: 'article',
  title,
  content: ErpStack(
    Object.entries(rules)
      .map(([key, value]) => `<div class="cg-ui-key-value"><span>${safe(key)}</span>${Badge(String(value), 'brand')}</div>`)
      .join(''),
    { gap: 'sm' }
  ),
  className: 'cg-u-min-0'
}).replace(
  `<h2 class="cg-ui-section-title">${safe(title)}</h2>`,
  `<h2 class="cg-ui-card-title"><i class="fa-solid ${safe(icon)}" aria-hidden="true"></i><span>${safe(title)}</span></h2>`
);

export const BusinessRulesPage = {
  render() {
    const cards = [
      block('Pedidos', 'fa-bell-concierge', ORDER_RULES),
      block('Inventario / Kardex', 'fa-boxes-stacked', INVENTORY_RULES),
      block('Contabilidad', 'fa-scale-balanced', ACCOUNTING_RULES),
      block('Nómina', 'fa-users-gear', PAYROLL_RULES),
      block('Pagos', 'fa-credit-card', PAYMENT_RULES)
    ].join('');

    return `<section class="cg-page-stack">${PageHeader({
      eyebrowKey:'businessRulesEyebrow',
      titleKey:'businessRulesTitle',
      descKey:'businessRulesDesc'
    })}${ErpGrid(cards, { columns:'two' })}<div class="cg-u-mt-lg">${ApprovalsPage.render()}</div></section>`;
  },
  mount(state, context) {
    ApprovalsPage.mount(state, context);
  }
};
