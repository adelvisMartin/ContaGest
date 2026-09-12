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

export type MessagingSendResult = {
  accepted: boolean;
  externalMessageId: string | null;
};

type MessageHandler = (message: NormalizedChannelMessage) => Promise<void> | void;

export class TestChannelAdapter {
  private state: MessagingChannelState = 'disconnected';
  private readonly handlers = new Set<MessageHandler>();
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

  receive(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async inject(message: NormalizedChannelMessage) {
    if (this.state !== 'connected') throw new Error('TEST_CHANNEL_NOT_CONNECTED');
    if (!message || String(message.channel || '').trim() !== this.channel) throw new Error('TEST_CHANNEL_IDENTITY_MISMATCH');
    if (!String(message.groupId || '').trim() || !String(message.externalMessageId || '').trim() || !String(message.senderId || '').trim()) {
      throw new Error('TEST_CHANNEL_INVALID_MESSAGE');
    }
    for (const handler of this.handlers) await handler(structuredClone(message));
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
