import { PageHeader, ErpCard, ErpGrid, ErpStack } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';
import { NotificationService } from '../services/notificationService.js';

const safe = (value) => escapeHtml(String(value ?? ''));

const supportCard = ({ icon, title, description }) => ErpCard(
  ErpStack(`
    <h2 class="cg-ui-card-title"><i class="fa-solid ${safe(icon)}" aria-hidden="true"></i><span>${safe(title)}</span></h2>
    <p class="cg-ui-muted">${safe(description)}</p>
  `, { gap:'sm' }),
  { tag:'article' }
);

export const SupportCtaPage = {
  render(state) {
    const phone = state.support?.whatsapp || '+584120000000';
    const link = NotificationService.supportWhatsAppLink({ phone, message: 'Hola, necesito soporte técnico para ContaGest-VE.' });
    const cards = [
      supportCard({ icon:'fa-headset', title:'Soporte técnico', description:'CTA directo a WhatsApp con mensaje precargado y soporte configurable por empresa.' }),
      supportCard({ icon:'fa-book', title:'Base de ayuda', description:'Guías por módulo, procedimientos y checklist QA para usuarios internos.' }),
      supportCard({ icon:'fa-triangle-exclamation', title:'Incidentes', description:'Escalamiento de fallas con registro, prioridad, módulo afectado y canal de notificación.' })
    ].join('');

    return `<section class="cg-page-stack">${PageHeader({
      eyebrowKey:'supportEyebrow',
      titleKey:'supportTitle',
      descKey:'supportDesc',
      actions:`<a class="cg-ui-button cg-ui-button-primary" href="${safe(link)}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>WhatsApp soporte</span></a>`
    })}${ErpGrid(cards, { columns:'three' })}</section>`;
  }
};
