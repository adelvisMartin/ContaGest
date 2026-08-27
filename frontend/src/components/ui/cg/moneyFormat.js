function parseExactMoney(value) {
  const raw = typeof value === 'bigint' ? value.toString() : typeof value === 'string' ? value.trim() : '';
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const negative = match[1] === '-';
  const integer = match[2].replace(/^0+(?=\d)/, '') || '0';
  const fraction = (match[3] || '').padEnd(2, '0');
  return { negative, integer, fraction };
}

function decimalSeparator(locale) {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    .formatToParts(1.1)
    .find((part) => part.type === 'decimal')?.value || '.';
}

export function formatMoneyExact(value, { currency = 'USD', locale = 'es-VE' } = {}) {
  const parsed = parseExactMoney(value);
  if (!parsed) return '—';

  const isNegativeZero = parsed.negative && parsed.integer === '0';
  const signedInteger = isNegativeZero
    ? -1n
    : BigInt(`${parsed.negative ? '-' : ''}${parsed.integer}`);

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const parts = formatter.formatToParts(signedInteger);
  if (isNegativeZero) {
    const integerPart = parts.find((part) => part.type === 'integer');
    if (integerPart) integerPart.value = '0';
  }

  const lastIntegerIndex = parts.reduce(
    (index, part, current) => (part.type === 'integer' ? current : index),
    -1,
  );
  if (lastIntegerIndex < 0) return '—';

  const fraction = `${decimalSeparator(locale)}${parsed.fraction}`;
  return parts.map((part, index) => `${part.value}${index === lastIntegerIndex ? fraction : ''}`).join('');
}
