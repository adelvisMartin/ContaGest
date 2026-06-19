import { PageHeader, Button } from '../components/ui/index.js';
import { NotificationService } from '../services/notificationService.js';

export const SupportCtaPage = {
  render(state) {
    const phone = state.support?.whatsapp || '+584120000000';
    const link = NotificationService.supportWhatsAppLink({ phone, message: 'Hola, necesito soporte técnico para ContaGest-VE.' });
    return `
      <section class="cg-page-stack">
        ${PageHeader({
          eyebrowKey:'supportEyebrow',
          titleKey:'supportTitle',
          descKey:'supportDesc',
          actions: `<a class="btn btn-primary" href="${link}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp"></i> WhatsApp soporte</a>`
        })}
        <div class="pl-grid-3">
          <article class="surface p-6"><i class="fa-solid fa-headset text-3xl text-[#1e3a8a]"></i><h3 class="mt-4 text-xl font-black">Soporte técnico</h3><p class="mt-2 text-slate-600 dark:text-slate-300">CTA directo a WhatsApp con mensaje precargado y soporte configurable por empresa.</p></article>
          <article class="surface p-6"><i class="fa-solid fa-book text-3xl text-[#1e3a8a]"></i><h3 class="mt-4 text-xl font-black">Base de ayuda</h3><p class="mt-2 text-slate-600 dark:text-slate-300">Guías por módulo, procedimientos y checklist QA para usuarios internos.</p></article>
          <article class="surface p-6"><i class="fa-solid fa-triangle-exclamation text-3xl text-[#1e3a8a]"></i><h3 class="mt-4 text-xl font-black">Incidentes</h3><p class="mt-2 text-slate-600 dark:text-slate-300">Escalamiento de fallas con registro, prioridad, módulo afectado y canal de notificación.</p></article>
        </div>
      </section>`;
  }
};
