/**
 * #854: provider-neutral, preview-only message catalog. Templates are text, not HTML.
 * No delivery, storage, provider calls, or tenant authority are introduced here.
 */
const CATALOG = {
  'operational.notice': {
    version: 1, classification: 'optional', slots: ['title', 'detail'],
    translations: {
      'es-VE': { subject: 'Aviso: {{title}}', body: '{{detail}}' },
      'en-US': { subject: 'Notice: {{title}}', body: '{{detail}}' }
    }
  },
  'sales.order-status': {
    version: 1, classification: 'transactional', slots: ['orderRef', 'stateLabel'],
    translations: {
      'es-VE': { subject: 'Estado del pedido {{orderRef}}', body: 'El pedido {{orderRef}} está en estado {{stateLabel}}.' },
      'en-US': { subject: 'Order {{orderRef}} status', body: 'Order {{orderRef}} has status {{stateLabel}}.' }
    }
  }
} as const;

export type NotificationTemplateKey = keyof typeof CATALOG;
export type NotificationTemplateValues = Record<string, string>;
export type NotificationTemplatePreview = Readonly<{
  key: NotificationTemplateKey;
  version: number;
  locale: 'es-VE' | 'en-US';
  classification: 'optional' | 'transactional';
  subject: string;
  body: string;
  deliveryScheduled: false;
}>;

export class NotificationTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationTemplateError';
  }
}

export function notificationTemplateKeys(): readonly NotificationTemplateKey[] {
  return Object.freeze(Object.keys(CATALOG) as NotificationTemplateKey[]);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function chooseLocale(locale: unknown): 'es-VE' | 'en-US' {
  return locale === 'en-US' ? 'en-US' : 'es-VE';
}

function isPlainRecord(value: unknown): value is NotificationTemplateValues {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function renderNotificationTemplate(
  key: string,
  locale: unknown,
  values: unknown
): NotificationTemplatePreview {
  if (!Object.hasOwn(CATALOG, key)) throw new NotificationTemplateError('Plantilla no disponible.');
  const template = CATALOG[key as NotificationTemplateKey];
  if (!isPlainRecord(values)) throw new NotificationTemplateError('Variables de plantilla inválidas.');
  const expected = new Set<string>(template.slots);
  const received = Object.keys(values);
  if (received.length !== expected.size || received.some((item) => !expected.has(item))) {
    throw new NotificationTemplateError('Variables de plantilla incompletas o desconocidas.');
  }
  const safeValues: Record<string, string> = {};
  for (const slot of template.slots) {
    const value = values[slot];
    if (typeof value !== 'string' || !value.trim() || value.length > 160 || /[\u0000-\u001F\u007F]/u.test(value)) {
      throw new NotificationTemplateError('Valor de plantilla inválido.');
    }
    safeValues[slot] = escapeHtml(value.trim());
  }
  const effectiveLocale = chooseLocale(locale);
  const localized = template.translations[effectiveLocale];
  const replace = (source: string): string => source.replace(/\{\{([A-Za-z]+)\}\}/g, (_match, slot: string) => safeValues[slot] ?? '');
  return Object.freeze({
    key: key as NotificationTemplateKey,
    version: template.version,
    locale: effectiveLocale,
    classification: template.classification,
    subject: replace(localized.subject),
    body: replace(localized.body),
    deliveryScheduled: false
  });
}

/**
 * Compare wall-clock time in an explicit IANA zone for an instant already in UTC.
 * Fall-back repeated DST hours are evaluated twice by design, and spring-gap
 * nonexistent wall times never create an artificial scheduling instant.
 * Scheduling belongs to #853, so this function never estimates runAt.
 */
export function evaluateNotificationQuietHours(input: {
  instant: Date;
  timeZone: string;
  start: string;
  end: string;
}): Readonly<{ deferred: boolean; localTime: string; timeZone: string }> {
  if (!(input.instant instanceof Date) || !Number.isFinite(input.instant.valueOf())) {
    throw new NotificationTemplateError('Instante inválido.');
  }
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hhmm.test(input.start) || !hhmm.test(input.end) || input.start === input.end) {
    throw new NotificationTemplateError('Horario de silencio inválido.');
  }
  let hours: string;
  let minutes: string;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: input.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(input.instant);
    hours = parts.find((p) => p.type === 'hour')?.value ?? '';
    minutes = parts.find((p) => p.type === 'minute')?.value ?? '';
  } catch {
    throw new NotificationTemplateError('Zona horaria inválida.');
  }
  const localTime = hours + ':' + minutes;
  if (!hhmm.test(localTime)) throw new NotificationTemplateError('Hora local inválida.');
  const deferred = input.start < input.end
    ? localTime >= input.start && localTime < input.end
    : localTime >= input.start || localTime < input.end;
  return Object.freeze({ deferred, localTime, timeZone: input.timeZone });
}

/** Public, immutable metadata for RBAC-protected catalog discovery.
 * Contains no recipient data, template render payloads, or delivery credentials.
 */
export function listNotificationTemplateDescriptors(): ReadonlyArray<Readonly<{
  key: NotificationTemplateKey;
  version: number;
  classification: 'optional' | 'transactional';
  slots: readonly string[];
  locales: readonly string[];
}>> {
  return Object.freeze(notificationTemplateKeys().map((key) => {
    const template = CATALOG[key];
    return Object.freeze({
      key,
      version: template.version,
      classification: template.classification,
      slots: Object.freeze([...template.slots]),
      locales: Object.freeze(['es-VE', 'en-US'])
    });
  }));
}
