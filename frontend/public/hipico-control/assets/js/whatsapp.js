import { compact, normalizePhone, plain } from './whatsapp/normalization.js';

export { normalizeChatPlay } from './whatsapp/normalization.js';
export { createWhatsAppParser, matchChatOffers, parseWhatsAppChat } from './whatsapp/parser.js';

export function participantMatchesSender(participant, sender, phone = '') {
  const participantPhone = normalizePhone(participant?.phone);
  if (phone && participantPhone && participantPhone === normalizePhone(phone)) return true;
  const values = [participant?.code, participant?.name, participant?.alias]
    .filter(Boolean)
    .map(compact);
  return values.includes(compact(sender));
}

export function senderCode(sender, phone = '') {
  const digits = normalizePhone(phone || sender);
  if (digits) return `w${digits.slice(-6)}`;
  const slug = plain(sender).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12);
  return slug || `chat${Date.now().toString().slice(-6)}`;
}

export function generateClosureText(companyName = 'CLUB HIPICO TRIPLE CROWN', scope = 'AMERICANAS') {
  return [
    `🇺🇸🏇🏻 ${scope.toUpperCase()} 🇺🇸🏇🏻`,
    '🔓🇨 🇪 🇷 🇷 🇦 🇩 🇴🔒',
    '📵🇨 🇪 🇷 🇷 🇦 🇩 🇴 📵',
    '      🏇🏇🏇🏇🏇🏇',
    '  ⚠️ 𝑵𝑶 𝑴𝑨𝑺 𝑱𝑼𝑮𝑨𝑫𝑨𝑺 ⚠️',
    '📵📵🛑🛑 CERRADO CERRADO 🛑🛑📵📵',
    '🔒 CARRERA CERRADA 🔒',
    '🛑🚫 NO HAY MÁS JUGADAS 🚫🛑',
    `🏇 ${companyName}`,
    'NOS REGIMOS POR EL CHAT📲 Y NUESTROS REGLAMENTOS📝',
    '👀 TODO TERCIO VA JUGANDO CON SU DISPONIBLE EN EL PLANO POZO. LA CASA NO PAGA EXCEDENTES SI SE PASAN DE SU MONTO, SALVO VALIDACIÓN DE UN ADMINISTRADOR.'
  ].join('\n');
}
