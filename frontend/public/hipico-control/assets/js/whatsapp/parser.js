import {
  compact,
  detectPairOnly,
  extractAmount,
  extractHorse,
  findTrack,
  idPart,
  normalizeChatPlay,
  normalizePhone,
  normalizeSender,
  parseDateTime
} from './normalization.js';

const HEADER_RE = /^\[(\d{1,2}:\d{2}\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)),\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\]\s*([^:]+):\s*(.*)$/i;
const PLAY_RE = /(?:10a\s*\d+(?:[.,]\d+)?|[1-6]\s*(?:y|\/)[1-6]|[1-6]nn?|[1-6]p|pp|pk|mar|pla|show|ret|tf|logro)/gi;
const OFFER_START_RE = /^(JUEGO|JUEGA|CONSIGO|CONSIGUE)\b/;
const CONFIRMATION_RE = /^(?:J|JUGANDO|SF|S\s*\/\s*F|SE FUE|OK|CONFIRMADO)$/;
const PENDING_RE = /(?:DEBE CONFIRMAR|POR CONFIRMAR|FALTA CONFIRMAR|ESPERANDO CONFIRMACION|ESPERANDO CONFIRMACIÓN)/;
const AMOUNT_ONLY_RE = /^\s*\d+(?:[.,]\d+)?\s*(?:k|mil|mm?|mill[oó]n(?:es)?|bs\.?)?\s*$/i;
const RACE_OPEN_RE = /(?:\b(?:SE\s+)?(?:APERTURO|APERTURA|APERTURADA|APERTURAMOS|ABRIO|ABIERTA|ABRIMOS)\b[\s\S]{0,100}\bCARRERA\b|\bCARRERA\b[\s\S]{0,100}\b(?:ABIERTA|APERTURADA|APERTURO)\b)/;

function validRaceNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function sameKnownRaceNumber(left, right) {
  const a = validRaceNumber(left?.raceNumber);
  const b = validRaceNumber(right?.raceNumber);
  return !a || !b || a === b;
}

function sameActionableRace(left, right) {
  if (!left?.actionable || !right?.actionable) return false;
  return compact(left.track) === compact(right.track) && validRaceNumber(left.raceNumber) === validRaceNumber(right.raceNumber);
}

function offerKey(offer) {
  return [
    offer.segmentId,
    offer.role,
    offer.senderKey,
    offer.play,
    offer.horse,
    offer.amount,
    compact(offer.track),
    validRaceNumber(offer.raceNumber) || ''
  ].join('|');
}

function extractRaceNumber(text) {
  const source = compact(text);
  const ordinal = source.match(/\b(\d{1,2})\s*(?:RA|DA|TA|MA)?\s+CARRERA\b/);
  if (ordinal) return Number(ordinal[1]);
  const explicit = source.match(/\bCARRERA\s*(?:NRO\.?|NO\.?|NUMERO|#)?\s*(\d{1,2})\b/);
  return explicit ? Number(explicit[1]) : null;
}

function extractRaceContext(text, catalog = []) {
  const track = findTrack(text, catalog);
  const raceNumber = extractRaceNumber(text);
  return {
    track,
    raceNumber,
    actionable: Boolean(track && Number.isInteger(raceNumber) && raceNumber > 0)
  };
}

function parseOffer(message, catalog, textOverride = null, metadata = {}) {
  const raw = String(textOverride ?? message.text ?? '').trim();
  const normalized = compact(raw);
  const roleMatch = normalized.match(OFFER_START_RE);
  if (!roleMatch) return [];
  const role = roleMatch[1].startsWith('CONS') ? 'receiver' : 'player';
  const amountInfo = extractAmount(raw);
  if (!amountInfo.amount) return [];
  const beforeAmount = amountInfo.index >= 0 ? raw.slice(0, amountInfo.index) : raw;
  const plays = [...beforeAmount.matchAll(PLAY_RE)];
  const pairOnly = !plays.length ? detectPairOnly(beforeAmount) : '';
  const horse = pairOnly || extractHorse(beforeAmount, plays);
  if (!horse) return [];

  const explicitTrack = findTrack(raw, catalog);
  const inheritedTrack = String(metadata.track || message?.raceContext?.track || '').trim();
  const track = explicitTrack || inheritedTrack;
  const explicitRaceNumber = validRaceNumber(extractRaceNumber(raw));
  const inheritedRaceNumber = validRaceNumber(metadata.raceNumber ?? message?.raceContext?.raceNumber);
  const raceNumber = explicitRaceNumber || inheritedRaceNumber;
  const sourcePlays = pairOnly ? ['PP'] : plays.map((match) => match[0]);
  if (!sourcePlays.length) return [];

  const reviewReasons = [];
  if (pairOnly) reviewReasons.push('notación x ambigua');
  const warnings = [];
  if (!track) warnings.push('hipódromo no escrito; se usa la carrera activa');
  if (track && !raceNumber) warnings.push('número de carrera no confirmado; se valida contra la carrera activa');

  return sourcePlays.map((rawPlay, index) => ({
    id: `${message.id}-O${index + 1}`,
    messageId: message.id,
    sender: message.sender,
    senderKey: message.senderKey,
    phone: message.phone,
    role,
    play: normalizeChatPlay(rawPlay),
    rawPlay: pairOnly ? pairOnly.replace('*', 'x') : rawPlay,
    horse,
    amount: amountInfo.amount,
    timestamp: message.timestamp,
    segmentId: message.segmentId || 1,
    original: raw,
    warnings,
    reviewReasons,
    requiresApproval: reviewReasons.length > 0,
    needsReview: reviewReasons.length > 0,
    duplicate: false,
    ...metadata,
    track,
    raceNumber
  }));
}

function isReplyishLine(line) {
  const normalized = compact(line);
  return Boolean(
    AMOUNT_ONLY_RE.test(String(line || '')) ||
    CONFIRMATION_RE.test(normalized) ||
    PENDING_RE.test(normalized) ||
    /^(?:NO|SI|SÍ|LISTO|DALE|VA|ANULADO|CANCELADO)$/.test(normalized)
  );
}

function parseReplyStructure(message, catalog) {
  const lines = String(message.text || '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const first = lines[0];
  const tail = lines.slice(1);
  if (!tail.every(isReplyishLine)) return null;
  const firstNormalized = compact(first);
  const firstIsOffer = OFFER_START_RE.test(firstNormalized);
  const firstIsShortQuote = AMOUNT_ONLY_RE.test(first) || CONFIRMATION_RE.test(firstNormalized) || PENDING_RE.test(firstNormalized);
  if (!firstIsOffer && !firstIsShortQuote) return null;
  const responseText = tail.join('\n');
  const responseNormalized = compact(responseText);
  const responseAmount = extractAmount(responseText).amount;
  const status = PENDING_RE.test(responseNormalized)
    ? 'pending'
    : CONFIRMATION_RE.test(responseNormalized)
      ? 'confirmed'
      : responseAmount > 0
        ? 'proposal'
        : 'note';
  const quotedOffers = firstIsOffer ? parseOffer(message, catalog, first, { quoted: true }) : [];
  return {
    id: `${message.id}-R1`,
    messageId: message.id,
    sender: message.sender,
    senderKey: message.senderKey,
    phone: message.phone,
    timestamp: message.timestamp,
    segmentId: message.segmentId || 1,
    raceContext: message.raceContext || null,
    quotedText: first,
    responseText,
    responseAmount,
    status,
    quotedOffers,
    linkedOfferIds: [],
    linkedSender: '',
    needsReview: true,
    reason: firstIsOffer
      ? 'La copia contiene una oferta citada y una respuesta corta; requiere validar quién tomó el monto.'
      : 'La respuesta conserva una cita corta sin el contexto completo de WhatsApp.'
  };
}

function classifyMessage(message) {
  const text = compact(message.text);
  if (/NO MAS JUGAD|CARRERA CERRADA|CERRADO CERRADO/.test(text)) return 'closure';
  if (PENDING_RE.test(text)) return 'pending-confirmation';
  if (CONFIRMATION_RE.test(text)) return 'confirmation';
  if (/\bLLEGADA\b/.test(text)) return 'arrival';
  if (/\bPIZARRA\s*:/.test(text) && /\d/.test(text)) return 'board';
  if (RACE_OPEN_RE.test(text)) return 'race-open';
  if (/\bTERCIOS\b/.test(text) && /\bJUEGA\b/.test(text)) return 'official-plan';
  if (OFFER_START_RE.test(text)) return 'offer';
  return 'other';
}

function extractBoard(text) {
  const source = String(text || '');
  const arrival = source.match(/\bllegada\s+(?:\d{1,2}\s*(?:na|ra|da|ta)\s+)?([0-9][0-9.\s,\-]*)/i);
  const board = source.match(/\bpizarra\s*[:\-]?\s*([0-9][0-9.\s,\-]*)/i);
  const match = arrival || board;
  if (!match) return [];
  return match[1].split(/[.\s,\-]+/).map((item) => item.trim()).filter(Boolean).slice(0, 6);
}

function sameOfferSignature(left, right) {
  if (!left || !right) return false;
  const sameTrack = !left.track || !right.track || compact(left.track) === compact(right.track);
  return left.play === right.play && left.horse === right.horse && left.amount === right.amount && sameTrack && sameKnownRaceNumber(left, right) && left.segmentId === right.segmentId;
}

function linkReplies(replies, offers) {
  for (const reply of replies) {
    const quoted = reply.quotedOffers?.[0];
    if (!quoted) continue;
    const linked = [...offers]
      .reverse()
      .find((offer) => !offer.duplicate && offer.messageId !== reply.messageId && sameOfferSignature(offer, quoted));
    if (!linked) continue;
    reply.linkedOfferIds = [linked.id];
    reply.linkedSender = linked.sender;
    reply.linkedOffer = {
      id: linked.id,
      sender: linked.sender,
      role: linked.role,
      play: linked.play,
      horse: linked.horse,
      amount: linked.amount,
      track: linked.track,
      raceNumber: linked.raceNumber
    };
  }
}

export function parseWhatsAppChat(input, options = {}) {
  const lines = String(input || '').replace(/\r/g, '').split('\n');
  const messages = [];
  let current = null;
  for (const line of lines) {
    const header = line.match(HEADER_RE);
    if (header) {
      const [, time, date, senderRaw, text] = header;
      const sender = normalizeSender(senderRaw);
      const phone = normalizePhone(sender);
      current = {
        id: `MSG-${messages.length + 1}-${idPart(sender)}`,
        time,
        date,
        timestamp: parseDateTime(date, time),
        sender,
        senderKey: phone || compact(sender),
        phone,
        text: text || ''
      };
      messages.push(current);
    } else if (current) {
      current.text += `${current.text ? '\n' : ''}${line}`;
    } else if (line.trim()) {
      current = {
        id: `MSG-${messages.length + 1}-SIN-REMITENTE`,
        time: '',
        date: '',
        timestamp: null,
        sender: 'Sin identificar',
        senderKey: 'SIN-IDENTIFICAR',
        phone: '',
        text: line.trim()
      };
      messages.push(current);
    }
  }

  const catalog = options.racetrackCatalog || [];
  let segmentId = 1;
  let activeRaceContext = null;
  const typed = [];

  for (const message of messages) {
    const preliminaryType = classifyMessage(message);
    const explicitContext = extractRaceContext(message.text, catalog);

    if (preliminaryType === 'race-open') {
      if (explicitContext.actionable) {
        if (activeRaceContext?.actionable && !sameActionableRace(activeRaceContext, explicitContext)) segmentId += 1;
        activeRaceContext = explicitContext;
      } else {
        if (activeRaceContext?.actionable) segmentId += 1;
        activeRaceContext = null;
      }
    }

    const raceContext = explicitContext.actionable
      ? explicitContext
      : activeRaceContext?.actionable
        ? { ...activeRaceContext, inherited: true }
        : explicitContext;
    const base = { ...message, segmentId, raceContext };
    const reply = parseReplyStructure(base, catalog);
    const type = reply ? 'reply' : preliminaryType;
    typed.push({ ...base, type, reply, board: extractBoard(base.text) });

    if (type === 'closure') {
      segmentId += 1;
      activeRaceContext = null;
    }
  }

  const offers = typed.flatMap((message) => message.type === 'offer' ? parseOffer(message, catalog) : []);
  const seen = new Map();
  for (const offer of offers) {
    const key = offerKey(offer);
    const previous = seen.get(key);
    if (previous) {
      const distance = offer.timestamp && previous.timestamp ? Math.abs(new Date(offer.timestamp) - new Date(previous.timestamp)) : 0;
      if (!distance || distance <= 3 * 60 * 1000) offer.duplicate = true;
    } else {
      seen.set(key, offer);
    }
  }

  const activeOffers = offers.filter((offer) => !offer.duplicate);
  const replies = typed
    .filter((message) => message.type === 'reply' && message.reply)
    .map((message) => ({ ...message.reply, segmentId: message.segmentId }));
  linkReplies(replies, offers);
  const matches = matchChatOffers(activeOffers);
  const matchedIds = new Set(matches.flatMap((match) => [...match.playerOfferIds, ...match.receiverOfferIds]));
  const unmatched = activeOffers.filter((offer) => !matchedIds.has(offer.id));
  const directConfirmations = typed.filter((message) => message.type === 'confirmation');
  const replyConfirmations = replies.filter((reply) => reply.status === 'confirmed');
  const pendingConfirmations = [
    ...typed.filter((message) => message.type === 'pending-confirmation'),
    ...replies.filter((reply) => reply.status === 'pending')
  ];
  const raceOpenings = typed.filter((message) => message.type === 'race-open');
  const segments = Math.max(1, typed.reduce((max, message) => Math.max(max, Number(message.segmentId) || 1), 1));

  return {
    messages: typed,
    offers,
    activeOffers,
    matches,
    unmatched,
    replies,
    confirmations: [...directConfirmations, ...replyConfirmations],
    pendingConfirmations,
    closures: typed.filter((message) => message.type === 'closure'),
    boards: typed.filter((message) => ['arrival', 'board'].includes(message.type) && message.board.length),
    raceOpenings,
    officialPlans: typed.filter((message) => message.type === 'official-plan'),
    segments,
    stats: {
      messages: typed.length,
      offers: offers.length,
      duplicates: offers.filter((offer) => offer.duplicate).length,
      matches: matches.length,
      unmatched: unmatched.length,
      replies: replies.length,
      pending: pendingConfirmations.length,
      closures: typed.filter((message) => message.type === 'closure').length,
      openings: raceOpenings.length,
      segments
    }
  };
}

function compatible(left, right) {
  const sameTrack = !left.track || !right.track || compact(left.track) === compact(right.track);
  return left.play === right.play && left.horse === right.horse && sameTrack && sameKnownRaceNumber(left, right) && left.senderKey !== right.senderKey && left.segmentId === right.segmentId;
}

export function matchChatOffers(offers = []) {
  const players = offers.filter((offer) => offer.role === 'player').map((offer) => ({ offer, remaining: offer.amount }));
  const receivers = offers.filter((offer) => offer.role === 'receiver').map((offer) => ({ offer, remaining: offer.amount }));
  const matches = [];
  for (const player of players) {
    for (const receiver of receivers) {
      if (player.remaining <= 0 || receiver.remaining <= 0 || !compatible(player.offer, receiver.offer)) continue;
      const amount = Math.min(player.remaining, receiver.remaining);
      const playerRaceNumber = validRaceNumber(player.offer.raceNumber);
      const receiverRaceNumber = validRaceNumber(receiver.offer.raceNumber);
      const reviewReasons = [...new Set([...(player.offer.reviewReasons || []), ...(receiver.offer.reviewReasons || [])])];
      if (Boolean(playerRaceNumber) !== Boolean(receiverRaceNumber)) reviewReasons.push('contexto de carrera incompleto');
      matches.push({
        id: `MATCH-${player.offer.id}-${receiver.offer.id}-${matches.length + 1}`,
        play: player.offer.play,
        horse: player.offer.horse,
        amount,
        track: player.offer.track || receiver.offer.track,
        raceNumber: playerRaceNumber || receiverRaceNumber,
        segmentId: player.offer.segmentId,
        player: player.offer.sender,
        playerKey: player.offer.senderKey,
        playerPhone: player.offer.phone,
        receiver: receiver.offer.sender,
        receiverKey: receiver.offer.senderKey,
        receiverPhone: receiver.offer.phone,
        playerOfferIds: [player.offer.id],
        receiverOfferIds: [receiver.offer.id],
        offerCount: 2,
        reviewReasons,
        requiresApproval: reviewReasons.length > 0,
        needsReview: reviewReasons.length > 0,
        confirmed: false
      });
      player.remaining -= amount;
      receiver.remaining -= amount;
    }
  }
  return matches;
}

export function createWhatsAppParser(defaultOptions = {}) {
  const racetrackCatalog = Array.isArray(defaultOptions.racetrackCatalog) ? [...defaultOptions.racetrackCatalog] : [];
  return Object.freeze({
    parse(input, options = {}) {
      return parseWhatsAppChat(input, {
        ...defaultOptions,
        ...options,
        racetrackCatalog: Array.isArray(options.racetrackCatalog) ? options.racetrackCatalog : racetrackCatalog
      });
    }
  });
}

export const __test__ = Object.freeze({
  classifyMessage,
  extractBoard,
  extractRaceNumber,
  extractRaceContext,
  compatible,
  sameOfferSignature,
  sameKnownRaceNumber,
  sameActionableRace,
  validRaceNumber
});
