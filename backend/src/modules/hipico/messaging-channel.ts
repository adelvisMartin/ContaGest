export type MessagingChannelState = 'connected' | 'disconnected';

export type NormalizedChannelMessage = {
  channel: string;
  groupId: string;
  externalMessageId: string;
  senderId: string;
  senderLabel?: string;
  sentAt: string;
  type: string;
  text: string;
  quotedExternalMessageId?: string | null;
  historySync: boolean;
  fromMe: boolean;
  hasMedia: boolean;
};

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

  async inject(message: NormalizedChannelMessage) {
    if (this.state !== 'connected') throw new Error('TEST_CHANNEL_NOT_CONNECTED');
    for (const handler of this.handlers) await handler(message);
  }

  async send(groupId: string, text: string): Promise<MessagingSendResult> {
    if (this.state !== 'connected') throw new Error('TEST_CHANNEL_NOT_CONNECTED');
    const target = String(groupId || '').trim();
    const body = String(text || '').trim();
    if (!target || !body) throw new Error('TEST_CHANNEL_INVALID_SEND');
    this.sent.push({ groupId: target, text: body });
    return { accepted: true, externalMessageId: `test-${this.sent.length}` };
  }
}
