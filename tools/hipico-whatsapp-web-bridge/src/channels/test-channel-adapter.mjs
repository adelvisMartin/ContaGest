import { assertMessagingChannel, sourceSendForbiddenError } from './messaging-channel.mjs';

const ALLOWED_ROLES = new Set(['source', 'lab']);

function channelError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function safeInbound(event, role) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw channelError('HIPICO_TEST_CHANNEL_EVENT_INVALID', 'Inbound test event must be an object.');
  }
  return {
    ...clone(event),
    channelRole: String(event.channelRole || role).trim().toLowerCase(),
    shadowMode: true,
    historySync: event.historySync === true,
    fromMe: event.fromMe === true,
    hasMedia: event.hasMedia === true,
    quoteDepth: Number.isInteger(event.quoteDepth) ? event.quoteDepth : 0,
    effectsAllowed: false,
    transportAction: 'NONE'
  };
}

export class TestChannelAdapter {
  #role;
  #connected = false;
  #queued = [];
  #cursor = 0;
  #handlers = new Set();
  #sent = [];
  #delivered = 0;

  constructor({ role = 'lab', events = [] } = {}) {
    const normalizedRole = String(role || '').trim().toLowerCase();
    if (!ALLOWED_ROLES.has(normalizedRole)) {
      throw channelError('HIPICO_TEST_CHANNEL_ROLE_INVALID', 'Test channel role must be source or lab.');
    }
    if (!Array.isArray(events)) {
      throw channelError('HIPICO_TEST_CHANNEL_EVENTS_INVALID', 'Test channel events must be an array.');
    }
    this.#role = normalizedRole;
    this.#queued = events.map((event) => safeInbound(event, this.#role));
    assertMessagingChannel(this);
  }

  async connect() {
    if (!this.#connected) this.#connected = true;
    await this.#drain();
    return this.status();
  }

  async disconnect() {
    this.#connected = false;
    return this.status();
  }

  status() {
    return Object.freeze({
      channel: 'test',
      role: this.#role,
      connected: this.#connected,
      queued: Math.max(0, this.#queued.length - this.#cursor),
      delivered: this.#delivered,
      sent: this.#sent.length
    });
  }

  receive(handler) {
    if (typeof handler !== 'function') {
      throw channelError('HIPICO_CHANNEL_RECEIVER_INVALID', 'MessagingChannel receive handler must be a function.');
    }
    this.#handlers.add(handler);
    return () => this.#handlers.delete(handler);
  }

  async send(message = {}) {
    const destinationRole = String(message?.destinationRole || this.#role).trim().toLowerCase();
    if (this.#role === 'source' || destinationRole === 'source') throw sourceSendForbiddenError();
    if (destinationRole !== 'lab') {
      throw channelError('HIPICO_CHANNEL_DESTINATION_FORBIDDEN', 'Test channel may only send to LAB.');
    }
    if (!this.#connected) {
      throw channelError('HIPICO_CHANNEL_NOT_CONNECTED', 'Test channel must be connected before send.');
    }
    const text = String(message?.text || '');
    if (!text || text.length > 4000) {
      throw channelError('HIPICO_CHANNEL_MESSAGE_INVALID', 'Test channel message must contain 1-4000 characters.');
    }
    const record = Object.freeze({
      accepted: true,
      destinationRole: 'lab',
      text,
      sequence: this.#sent.length + 1
    });
    this.#sent.push(record);
    return record;
  }

  async pushInbound(event) {
    const normalized = safeInbound(event, this.#role);
    this.#queued.push(normalized);
    if (this.#connected) await this.#drain();
    return clone(normalized);
  }

  async #drain() {
    if (!this.#connected) return;
    while (this.#cursor < this.#queued.length) {
      const event = this.#queued[this.#cursor];
      this.#cursor += 1;
      for (const handler of this.#handlers) await handler(clone(event));
      this.#delivered += 1;
    }
  }
}
