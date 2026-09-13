import {
  hipicoNormalizedMessageSchema,
  type HipicoNormalizedMessage
} from './hipico-domain.js';

export type MessagingChannelState = 'connected' | 'disconnected';
export type NormalizedChannelMessage = HipicoNormalizedMessage;

export type MessagingChannelStatus = {
  state: MessagingChannelState;
  channel: string;
  receiveOnly: boolean;
  effectsAllowed: false;
};

export type MessagingSendResult = {
  accepted: boolean;
  externalMessageId: string | null;
};

export type MessagingInjectResult = {
  accepted: boolean;
  duplicate: boolean;
  messageKey: string;
};

export interface MessagingChannel {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  status(): Promise<MessagingChannelStatus>;
  receive(handler: (message: NormalizedChannelMessage) => Promise<void> | void): () => void;
  send(groupId: string, text: string): Promise<MessagingSendResult>;
}

function normalizedGroupId(value: unknown) {
  const groupId = String(value ?? '').trim();
  if (!groupId || groupId.length > 220) throw new Error('MESSAGING_CHANNEL_GROUP_INVALID');
  return groupId;
}

function normalizedText(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 4000) throw new Error('MESSAGING_CHANNEL_TEXT_INVALID');
  return text;
}

function messageIdentity(message: HipicoNormalizedMessage) {
  return `${message.channel}\u0000${message.groupId}\u0000${message.externalMessageId}`;
}

/**
 * Deterministic channel used by unit/E2E tests. It deliberately contains no
 * classifier, persistence, race-state transition or automatic-send behavior.
 * History replay is delivered with `historySync=true` and deduplicated by the
 * canonical channel/group/external-message identity before a handler runs.
 */
export class TestChannelAdapter implements MessagingChannel {
  private state: MessagingChannelState = 'disconnected';
  private readonly handlers = new Set<(message: NormalizedChannelMessage) => Promise<void> | void>();
  private readonly seen = new Set<string>();
  private sendSequence = 0;
  readonly sent: Array<{ groupId: string; text: string; externalMessageId: string }> = [];

  constructor(
    private readonly channel = 'test',
    private readonly allowedGroups: ReadonlySet<string> | null = null
  ) {}

  async connect() {
    this.state = 'connected';
  }

  async disconnect() {
    this.state = 'disconnected';
  }

  async status(): Promise<MessagingChannelStatus> {
    return {
      state: this.state,
      channel: this.channel,
      receiveOnly: false,
      effectsAllowed: false
    };
  }

  receive(handler: (message: NormalizedChannelMessage) => Promise<void> | void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private assertConnected() {
    if (this.state !== 'connected') throw new Error('TEST_CHANNEL_NOT_CONNECTED');
  }

  private assertGroupAllowed(groupId: string) {
    if (this.allowedGroups && !this.allowedGroups.has(groupId)) {
      throw new Error('TEST_CHANNEL_GROUP_NOT_ALLOWED');
    }
  }

  async inject(input: unknown): Promise<MessagingInjectResult> {
    this.assertConnected();
    const message = hipicoNormalizedMessageSchema.parse(input);
    if (message.channel !== this.channel) throw new Error('TEST_CHANNEL_IDENTITY_MISMATCH');
    this.assertGroupAllowed(message.groupId);

    const key = messageIdentity(message);
    if (this.seen.has(key)) return { accepted: true, duplicate: true, messageKey: key };

    // Reserve before dispatch so a re-entrant duplicate cannot execute a domain
    // handler twice. A failing handler releases the reservation for an explicit retry.
    this.seen.add(key);
    try {
      for (const handler of this.handlers) await handler(message);
      return { accepted: true, duplicate: false, messageKey: key };
    } catch (error) {
      this.seen.delete(key);
      throw error;
    }
  }

  async send(groupIdValue: string, textValue: string): Promise<MessagingSendResult> {
    this.assertConnected();
    const groupId = normalizedGroupId(groupIdValue);
    this.assertGroupAllowed(groupId);
    const text = normalizedText(textValue);
    this.sendSequence += 1;
    const externalMessageId = `test-${this.sendSequence}`;
    this.sent.push({ groupId, text, externalMessageId });
    return { accepted: true, externalMessageId };
  }
}
