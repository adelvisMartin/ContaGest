import { BackendApi } from './backendApi.js';
import { buildWhatsAppOrderMessage, whatsappDeepLink } from './orderService.js';

export const NotificationChannels = [
  { key: 'whatsapp', label: 'WhatsApp', icon: 'fa-brands fa-whatsapp' },
  { key: 'email', label: 'Email', icon: 'fa-regular fa-envelope' },
  { key: 'telegram', label: 'Telegram', icon: 'fa-brands fa-telegram' },
  { key: 'webhook', label: 'Webhook', icon: 'fa-solid fa-code-branch' }
];

export const NotificationService = {
  async notifyOrder(order, channel = 'whatsapp', settings = {}) {
    if (channel === 'whatsapp') {
      const message = buildWhatsAppOrderMessage(order, settings.companyName || 'ContaGest-VE');
      if (!settings.useBackend) {
        window.open(whatsappDeepLink(order.phone || settings.supportPhone, message), '_blank', 'noopener,noreferrer');
        return { ok: true, mode: 'deeplink', channel, message };
      }
      return BackendApi.post('/api/v1/notifications/whatsapp/order', { order, message });
    }
    return BackendApi.post('/api/v1/notifications/send', { channel, order });
  },
  supportWhatsAppLink({ phone, message = 'Hola, necesito soporte técnico con ContaGest-VE.' }) {
    const normalized = String(phone || '').replace(/[^\d]/g, '');
    return `https://wa.me/${normalized || ''}?text=${encodeURIComponent(message)}`;
  }
};
