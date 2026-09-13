export const MESSAGING_CHANNEL_METHODS = Object.freeze([
  'connect',
  'disconnect',
  'status',
  'receive',
  'send'
]);

export class MessagingChannelContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MessagingChannelContractError';
    this.code = 'HIPICO_CHANNEL_CONTRACT_INVALID';
  }
}

export function assertMessagingChannel(channel) {
  if (!channel || (typeof channel !== 'object' && typeof channel !== 'function')) {
    throw new MessagingChannelContractError('MessagingChannel must be an object.');
  }
  const missing = MESSAGING_CHANNEL_METHODS.filter((method) => typeof channel[method] !== 'function');
  if (missing.length) {
    throw new MessagingChannelContractError(`MessagingChannel missing methods: ${missing.join(', ')}`);
  }
  return channel;
}

export function sourceSendForbiddenError() {
  const error = new Error('SOURCE is read-only; transport send is forbidden.');
  error.code = 'HIPICO_SOURCE_SEND_FORBIDDEN';
  return error;
}
