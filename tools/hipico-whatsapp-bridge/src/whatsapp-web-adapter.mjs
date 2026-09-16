import crypto from 'node:crypto';

const GROUP_ID_RE = /@g\.us$/;

function normalizedGroupId(value) {
  const groupId = String(value || '').trim();
  if (!GROUP_ID_RE.test(groupId) || groupId.length > 220) {
    throw new Error('WHATSAPP_CHANNEL_GROUP_INVALID');
  }
  return groupId;
}

function normalizedText(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 4000) throw new Error('WHATSAPP_CHANNEL_TEXT_INVALID');
  return text;
}

function groupIdFor(message) {
  const from = String(message?.from || '');
  const to = String(message?.to || '');
  if (GROUP_ID_RE.test(from)) return from;
  if (GROUP_ID_RE.test(to)) return to;
  return '';
}

function mediaKindFor(message) {
  if (!message?.hasMedia) return 'none';
  const type = String(message?.type || '').trim().toLowerCase();
  if (['image', 'video', 'audio', 'document'].includes(type)) return type;
  return 'unknown';
}

function fallbackMessageId(message, groupId) {
  return crypto.createHash('sha256')
    .update(`${groupId}|${message?.timestamp || ''}|${message?.body || ''}`)
    .digest('hex');
}

async function quotedMessageId(message) {
  if (!message?.hasQuotedMsg) return null;
  try {
    const quoted = await message.getQuotedMessage();
    return quoted?.id?._serialized || null;
  } catch {
    return null;
  }
}

async function senderLabel(message) {
  try {
    const contact = await message.getContact();
    return contact?.pushname || contact?.name || contact?.shortName || '';
  } catch {
    return '';
  }
}

async function normalizeMessage(message, channel) {
  const groupId = groupIdFor(message);
  if (!groupId) return null;
  const hasMedia = Boolean(message?.hasMedia);
  return {
    channel,
    groupId,
    externalMessageId: message?.id?._serialized || fallbackMessageId(message, groupId),
    senderId: message?.author || (message?.fromMe ? 'self' : message?.from || ''),
    senderLabel: await senderLabel(message),
    sentAt: message?.timestamp
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : new Date().toISOString(),
    type: hasMedia ? 'media' : 'chat',
    text: String(message?.body || '').slice(0, 4000),
    quotedExternalMessageId: await quotedMessageId(message),
    historySync: message?.historySync === true,
    fromMe: Boolean(message?.fromMe),
    hasMedia,
    mediaKind: mediaKindFor(message)
  };
}

export class WhatsAppWebAdapter {
  #state = 'disconnected';
  #receiver = null;
  #client;
  #allowedGroups;
  #includeOwnMessages;
  #allowSend;
  #channel;
  #callbacks;

  constructor({
    client,
    allowedGroups,
    includeOwnMessages = true,
    allowSend = false,
    channel = 'whatsapp-web',
    callbacks = {}
  }) {
    if (!client || typeof client.on !== 'function') throw new Error('WHATSAPP_CHANNEL_CLIENT_REQUIRED');
    this.#client = client;
    this.#allowedGroups = allowedGroups instanceof Set ? allowedGroups : new Set(allowedGroups || []);
    this.#includeOwnMessages = Boolean(includeOwnMessages);
    this.#allowSend = Boolean(allowSend);
    this.#channel = String(channel || 'whatsapp-web').trim() || 'whatsapp-web';
    this.#callbacks = callbacks;
    this.#bindEvents();
  }

  #safeCallback(name, ...args) {
    const callback = this.#callbacks?.[name];
    if (typeof callback !== 'function') return;
    let callbackResult;
    try {
      callbackResult = callback(...args);
    } catch (error) {
      this.#reportCallbackError(name, error);
      return;
    }
    Promise.resolve(callbackResult).catch((error) => this.#reportCallbackError(name, error));
  }

  #reportCallbackError(sourceName, error) {
    if (sourceName === 'onError') return;
    const onError = this.#callbacks?.onError;
    if (typeof onError !== 'function') return;
    try {
      Promise.resolve(onError(error)).catch(() => {});
    } catch {
      // Error reporting itself must never create a callback loop or unhandled effect.
    }
  }

  #bindEvents() {
    this.#client.on('qr', (qr) => this.#safeCallback('onQr', qr));
    this.#client.on('authenticated', () => this.#safeCallback('onAuthenticated'));
    this.#client.on('auth_failure', (reason) => {
      this.#state = 'disconnected';
      this.#safeCallback('onAuthFailure', reason);
    });
    this.#client.on('disconnected', (reason) => {
      this.#state = 'disconnected';
      this.#safeCallback('onDisconnected', reason);
    });
    this.#client.on('ready', () => {
      this.#state = 'connected';
      this.#safeCallback('onReady');
    });
    this.#client.on('message_create', (message) => {
      void this.#handleInbound(message);
    });
  }

  async #handleInbound(message) {
    try {
      if (this.#state !== 'connected' || !this.#receiver) return;
      if (!this.#includeOwnMessages && message?.fromMe) return;
      const normalized = await normalizeMessage(message, this.#channel);
      if (!normalized || !this.#allowedGroups.has(normalized.groupId)) return;
      await this.#receiver(normalized);
    } catch (error) {
      this.#safeCallback('onError', error, message);
    }
  }

  async connect() {
    if (this.#state === 'connected') return;
    await this.#client.initialize();
  }

  async disconnect() {
    try {
      await this.#client.destroy();
    } finally {
      this.#state = 'disconnected';
    }
  }

  async status() {
    return {
      state: this.#state,
      channel: this.#channel,
      receiveOnly: !this.#allowSend,
      effectsAllowed: false
    };
  }

  receive(handler) {
    if (typeof handler !== 'function') throw new Error('WHATSAPP_CHANNEL_RECEIVER_REQUIRED');
    if (this.#receiver) throw new Error('WHATSAPP_CHANNEL_RECEIVER_ALREADY_REGISTERED');
    this.#receiver = handler;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (this.#receiver === handler) this.#receiver = null;
    };
  }

  async resolvePinnedGroup(role, id, configuredName = '') {
    const groupId = normalizedGroupId(id);
    try {
      const chat = await this.#client.getChatById(groupId);
      if (!chat?.isGroup || chat.id?._serialized !== groupId) return null;
      return { id: groupId, name: String(configuredName || chat.name || `Grupo ${role}`).slice(0, 220) };
    } catch {
      return null;
    }
  }

  async send(groupIdValue, textValue) {
    if (this.#state !== 'connected') throw new Error('WHATSAPP_CHANNEL_NOT_CONNECTED');
    const groupId = normalizedGroupId(groupIdValue);
    if (!this.#allowedGroups.has(groupId)) throw new Error('WHATSAPP_CHANNEL_GROUP_NOT_ALLOWED');
    const text = normalizedText(textValue);
    if (!this.#allowSend) return { accepted: false, externalMessageId: null };
    const sent = await this.#client.sendMessage(groupId, text);
    return {
      accepted: true,
      externalMessageId: sent?.id?._serialized || null
    };
  }
}

export const __test__ = { groupIdFor, mediaKindFor, normalizeMessage };
