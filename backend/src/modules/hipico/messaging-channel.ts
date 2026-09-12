import {
  hipicoNormalizedMessageSchema,
  type HipicoNormalizedMessage
} from './hipico-domain.js';

export type MessagingChannelState = 'connected' | 'disconnected';
export type NormalizedChannelMessage = HipicoNormalizedMessage;

export type MessagingChannelStatus = {
  state: MessagingChannelState;
  channel: string;
};

export type MessagingSendResult = {
  accepted: boolean;
  externalMessageId: string | null;
};

export interface MessagingChannel {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  status(): Promise<MessagingChannelStatus>;
  receive(handler: (message: NormalizedChannelMessage) => Promise<void> | void): () => void;
  send(groupId: string, text: string): Promise<MessagingSendResult>;
}

/**
 * Deterministic channel adapter for unit/integration/E2E. It validates the same
 * normalized message contract as production adapters and never classifies,
 * mutates domain state or auto-sends on receive.
 */
export class TestChannelAdapter implements MessagingChannel {
  private state: MessagingChannelState = 'disconnected';
  private handlers = new Set<(message: NormalizedChannelMessage) => Promise<void> | void>();
  readonly sent: Array<{ groupId: string; text: string }> = [];

  constructor(private readonly channel = 'test') {}

  async connect() {
    this.state = 'connected';
  }

  async disconnect() {
    this.state = 'disconnected';
  }

  async status() {
    return { state: this.state, channel: this.channel };
  }

  receive(handler: (message: NormalizedChannelMessage) => Promise<void> | void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async inject(input: unknown) {
    if (this.state !== 'connected') throw new Error('TEST_CHANNEL_NOT_CONNECTED');
    const message = hipicoNormalizedMessageSchema.parse(input);
    for (const handler of this.handlers) await handler(message);
    return message;
  }

  async send(groupId: string, text: string): Promise<MessagingSendResult> {
    if (this.state !== 'connected') throw new Error('TEST_CHANNEL_NOT_CONNECTED');
    const target = String(groupId || '').trim();
    const body = String(text || '').trim();
    if (!target || target.length > 220 || !body || body.length > 4000) throw new Error('TEST_CHANNEL_INVALID_SEND');
    this.sent.push({ groupId: target, text: body });
    return { accepted: true, externalMessageId: `test-${this.sent.length}` };
  }
}
