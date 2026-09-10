import { compact, normalizePhone, plain } from './whatsapp/normalization.js';
import { createWhatsAppParser as createLegacyWhatsAppParser, matchChatOffers, parseWhatsAppChat as parseLegacyWhatsAppChat } from './whatsapp/parser.js';
import { looksLikeWhatsAppUiTranscript, parseWhatsAppUiTranscript } from './whatsapp/ui-transcript.js';

export { normalizeChatPlay } from './whatsapp/normalization.js';
export { matchChatOffers };

function syntheticClock(index){
  const minute=index%60;
  const hour=1+Math.floor(index/60)%11;
  return `${hour}:${String(minute).padStart(2,'0')} a.m.`;
}

function uiTranscriptAsExport(messages){
  const dayOrder=[];
  const dayIndex=(label)=>{
    const key=String(label||'sin-fecha').toLowerCase();
    let index=dayOrder.indexOf(key);
    if(index<0){dayOrder.push(key);index=dayOrder.length-1;}
    return index;
  };
  return messages.filter((message)=>!message.systemKind).map((message,index)=>{
    const offset=dayIndex(message.dateLabel);
    const date=`${String(1+offset).padStart(2,'0')}/01/2000`;
    const time=message.time||syntheticClock(index);
    const sender=message.phone||message.sender||'Sin identificar';
    const body=String(message.text||'');
    return `[${time}, ${date}] ${sender}: ${body}`;
  }).join('\n');
}

function enrichUiAnalysis(input,options){
  const ui=parseWhatsAppUiTranscript(input);
  const textMessages=ui.messages.filter((message)=>!message.systemKind);
  const analysis=parseLegacyWhatsAppChat(uiTranscriptAsExport(ui.messages),options);
  const originalByLegacyId=new Map();
  const identityByKey=new Map();

  analysis.messages.forEach((message,index)=>{
    const original=textMessages[index];
    if(!original)return;
    originalByLegacyId.set(message.id,original);
    identityByKey.set(original.senderKey,original);
    message.sender=original.sender;
    message.senderKey=original.senderKey;
    message.phone=original.phone;
    message.time=original.time;
    message.dateLabel=original.dateLabel;
    message.sourceFormat=ui.sourceFormat;
    message.forwarded=original.forwarded;
  });

  for(const offer of analysis.offers||[]){
    const original=originalByLegacyId.get(offer.messageId);
    if(!original)continue;
    offer.sender=original.sender;
    offer.senderKey=original.senderKey;
    offer.phone=original.phone;
  }
  for(const reply of analysis.replies||[]){
    const original=originalByLegacyId.get(reply.messageId);
    if(!original)continue;
    reply.sender=original.sender;
    reply.senderKey=original.senderKey;
    reply.phone=original.phone;
  }
  for(const match of analysis.matches||[]){
    const player=identityByKey.get(match.playerKey);
    const receiver=identityByKey.get(match.receiverKey);
    if(player){match.player=player.sender;match.playerPhone=player.phone;}
    if(receiver){match.receiver=receiver.sender;match.receiverPhone=receiver.phone;}
  }

  let parsedIndex=0;
  let segmentId=1;
  const merged=ui.messages.map((message)=>{
    if(message.systemKind)return {...message,type:message.systemKind,segmentId,board:[],reply:null};
    const parsed=analysis.messages[parsedIndex++]||{...message,type:'other',segmentId,board:[],reply:null};
    segmentId=parsed.type==='closure'?Number(parsed.segmentId||segmentId)+1:Number(parsed.segmentId||segmentId);
    return parsed;
  });
  const documents=merged.filter((message)=>message.type==='document');
  const stickers=merged.filter((message)=>message.type==='sticker');
  const noise=merged.filter((message)=>message.type==='noise');
  const attachments=merged.filter((message)=>['document','sticker','image','video','audio','media'].includes(message.type));
  analysis.messages=merged;
  analysis.documents=documents;
  analysis.stickers=stickers;
  analysis.noise=noise;
  analysis.attachments=attachments;
  analysis.sourceFormat=ui.sourceFormat;
  analysis.stats={...analysis.stats,messages:merged.length,documents:documents.length,stickers:stickers.length,ignored:attachments.length+noise.length};
  return analysis;
}

export function parseWhatsAppChat(input,options={}){
  if(looksLikeWhatsAppUiTranscript(input))return enrichUiAnalysis(input,options);
  return {...parseLegacyWhatsAppChat(input,options),sourceFormat:'whatsapp-export'};
}

export function createWhatsAppParser(defaultOptions={}){
  const legacy=createLegacyWhatsAppParser(defaultOptions);
  return Object.freeze({
    parse(input,options={}){
      if(looksLikeWhatsAppUiTranscript(input))return enrichUiAnalysis(input,{...defaultOptions,...options});
      return {...legacy.parse(input,options),sourceFormat:'whatsapp-export'};
    }
  });
}

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
